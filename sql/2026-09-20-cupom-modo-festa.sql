-- ============================================================================
-- Cupom no Modo Festa                                              2026-09-20
-- ----------------------------------------------------------------------------
-- Até aqui a Commerly Garantia (DESCULPA-*) e a campanha de retorno (VOLTA-*)
-- geravam cupons em `cupons` e avisavam o cliente — mas NENHUM checkout
-- aceitava cupom (ver memória cupons_sem_resgate). Agora o cupom vale no
-- Modo Festa, e só nele.
--
-- DECISÕES DE PRODUTO (2026-09-20):
--  1. Cupom só em festa. Quem aplica é o CRIADOR (é ele que fecha), o cupom
--     precisa ser dele, e o abatimento é RATEADO proporcionalmente entre os
--     pedidos de todos os participantes das lojas que aceitam cupom.
--  2. A loja tem o toggle `lojas.aceita_cupom` (default FALSE). Sem toggle,
--     o pedido daquela loja fica fora do rateio e o cupom continua intacto.
--  3. Desconto automático no fechamento, sem aprovação por pedido.
--  4. QUEM PAGA: cupom de retorno (loja_id preenchido) sai do valor que a
--     própria loja recebe (ela criou o cupom). Cupom da Garantia (loja_id
--     nulo) é custo da COMMERLY — o abatimento entra no pedido do mesmo
--     jeito (o cliente paga menos na entrega), mas `cupom_usos.custeado_por`
--     = 'plataforma' registra que a Commerly deve esse valor à loja. A
--     liquidação desse valor NÃO está neste arquivo (decisão pendente).
--  5. Centavos: rateio pelo método do MAIOR RESTO (Hamilton) em centavos
--     inteiros — a soma das parcelas é EXATAMENTE o desconto, e nenhuma
--     parcela passa da base do pedido. Uma função só (`ratear_centavos`),
--     usada pela prévia e pela aplicação.
--  6. Cancelamento: se TODOS os pedidos que receberam abatimento forem
--     cancelados, o cupom volta a ficar disponível e ganha de validade o
--     tempo em que ficou consumido. Cancelamento parcial não devolve nada.
--
-- SEGURANÇA: o cliente manda só `cupom_id`. Posse, validade, elegibilidade,
-- base do rateio (o `total` que o guard já tornou autoritativo), centavos e
-- consumo são decididos em `aplicar_cupom_festa`, numa transação só, com
-- `select ... for update` no cupom. A função é só do service role.
--
-- O guard `pedidos_clientes_guard` congela `total` no UPDATE; a aplicação
-- passa por uma escotilha (GUC `commerly.cupom_festa`, service role, pedido
-- de festa em 'recebido', sem cupom ainda, e SÓ na forma
-- total = old.total - desconto, com desconto <= subtotal). Patch feito sobre
-- o corpo vivo com replace() + md5 (regra 5 do CLAUDE.md).
--
-- APLICADO em produção via MCP em 2026-09-20 (dry-run em rollback antes;
-- teste funcional com festa de 2 pedidos, guard, reuso e cancelamento OK).
-- md5 do guard depois do patch: 3625a8c3360200944b8359994dd5164f
-- ============================================================================
begin;

-- ============================================================================
-- 1. TOGGLE DA LOJA
-- ============================================================================
alter table public.lojas add column if not exists aceita_cupom boolean not null default false;

-- View pública: recriada com TODAS as colunas vivas (2026-09-19) + aceita_cupom.
-- `create or replace view` só aceita coluna nova no FIM — e é assim que está.
create or replace view public.lojas_publicas as
 select id,
    nome,
    tipo,
    localizacao,
    telefone,
    instagram,
    horario,
    latitude,
    longitude,
    fotos_fachada,
    taxa_entrega,
    website_url,
    created_at,
    stripe_onboarded and stripe_account_id is not null as aceita_pagamento_online,
    distancia_maxima_entrega,
    preco_dinamico,
    aceita_drone,
    destaque_ate is not null and destaque_ate > now() as destaque,
    whatsapp_business,
    (plano = 'ativo'::text or trial_expira_em is not null and trial_expira_em > now()) and exclusao_solicitada_em is null as disponivel,
    aceita_cupom
   from public.lojas;

-- ============================================================================
-- 2. CONSUMO DO CUPOM
-- ============================================================================
alter table public.cupons add column if not exists festa_id uuid references public.festas(id) on delete set null;
-- Quanto de fato foi abatido (pode ser menor que `valor`: clamp no subtotal
-- elegível ou lojas que não aceitam).
alter table public.cupons add column if not exists desconto_aplicado numeric(10,2);
-- Um cupom por festa e uma festa por cupom.
create unique index if not exists cupons_festa_uidx on public.cupons (festa_id) where festa_id is not null;

-- ============================================================================
-- 3. ABATIMENTO NO PEDIDO (denormalizado para as telas; congelado pelo guard)
-- ============================================================================
alter table public.pedidos_clientes add column if not exists cupom_id uuid references public.cupons(id) on delete set null;
alter table public.pedidos_clientes add column if not exists desconto_cupom numeric(10,2) not null default 0;

-- ============================================================================
-- 4. REGISTRO AUDITÁVEL DO RATEIO
-- ============================================================================
create table if not exists public.cupom_usos (
  id           uuid primary key default gen_random_uuid(),
  cupom_id     uuid not null references public.cupons(id) on delete cascade,
  festa_id     uuid references public.festas(id) on delete set null,
  pedido_id    uuid not null unique references public.pedidos_clientes(id) on delete cascade,
  loja_id      uuid not null references public.lojas(id) on delete cascade,
  -- Subtotal do pedido (total - taxa) no momento do rateio.
  base         numeric(10,2) not null check (base >= 0),
  -- Parcela do desconto que coube a este pedido.
  desconto     numeric(10,2) not null check (desconto >= 0),
  -- 'loja' = sai do repasse da loja (cupom de retorno);
  -- 'plataforma' = a Commerly deve este valor à loja (Garantia).
  custeado_por text not null check (custeado_por in ('loja', 'plataforma')),
  estornado_em timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists cupom_usos_cupom_idx on public.cupom_usos (cupom_id) where estornado_em is null;
create index if not exists cupom_usos_loja_idx  on public.cupom_usos (loja_id, created_at desc);

alter table public.cupom_usos enable row level security;

-- Leitura: dono do cupom (cliente) e a loja do pedido. Escrita: nenhuma policy
-- — só a RPC (security definer) escreve.
drop policy if exists cupom_usos_select on public.cupom_usos;
create policy cupom_usos_select on public.cupom_usos for select using (
  cupom_id in (select c.id from public.cupons c
                join public.clientes cl on cl.id = c.cliente_id
               where cl.user_id = auth.uid())
  or loja_id in (select id from public.lojas where user_id = auth.uid())
);

-- ============================================================================
-- 5. RATEIO EM CENTAVOS — método do maior resto (Hamilton)
--
--    p_total: desconto em centavos; p_bases: subtotal de cada pedido em
--    centavos. Devolve a parcela de cada pedido, na mesma ordem.
--    Invariantes: sum(parcelas) = p_total; parcela[i] <= p_bases[i]
--    (exige p_total <= sum(bases)). Empate no resto: menor índice ganha
--    (quem chama passa os pedidos em ordem de created_at, id — determinístico).
-- ============================================================================
create or replace function public.ratear_centavos(p_total integer, p_bases integer[])
returns integer[]
language plpgsql
immutable
set search_path to 'public'
as $$
declare
  n      int := coalesce(array_length(p_bases, 1), 0);
  s      bigint;
  parc   int[];
  restos numeric[];
  resto  int;
  i      int;
  rec    record;
begin
  if n = 0 then return '{}'::int[]; end if;
  if p_total < 0 then raise exception 'Desconto negativo.' using errcode = 'P0001'; end if;
  select sum(b) into s from unnest(p_bases) b;
  if s is null or s <= 0 then raise exception 'Bases do rateio invalidas.' using errcode = 'P0001'; end if;
  if p_total > s then raise exception 'Desconto (%) maior que a base (%).', p_total, s using errcode = 'P0001'; end if;

  parc   := array_fill(0, array[n]);
  restos := array_fill(0::numeric, array[n]);
  for i in 1..n loop
    if p_bases[i] < 0 then raise exception 'Base negativa no rateio.' using errcode = 'P0001'; end if;
    parc[i]   := floor(p_total::numeric * p_bases[i] / s)::int;
    restos[i] := p_total::numeric * p_bases[i] / s - parc[i];
  end loop;

  select p_total - coalesce(sum(x), 0) into resto from unnest(parc) x;

  -- +1 centavo para os `resto` maiores restos. Como o resto fracionário só
  -- existe quando floor < raw <= base, o +1 nunca passa da base.
  for rec in
    select idx from unnest(restos) with ordinality as t(r, idx)
     order by r desc, idx asc
     limit resto
  loop
    parc[rec.idx::int] := parc[rec.idx::int] + 1;
  end loop;

  return parc;
end;
$$;

revoke all on function public.ratear_centavos(integer, integer[]) from public, anon, authenticated;

-- ============================================================================
-- 6. DESCONTO TOTAL DO CUPOM sobre uma soma elegível (em centavos)
--    percentual -> arredonda meio para cima na casa do centavo;
--    valor      -> nunca passa da soma (cupom não vira crédito).
-- ============================================================================
create or replace function public.cupom_desconto_centavos(p_tipo text, p_valor numeric, p_soma_centavos bigint)
returns integer
language sql
immutable
set search_path to 'public'
as $$
  select case
    when p_soma_centavos <= 0 then 0
    when p_tipo = 'percentual' then least(round(p_soma_centavos * p_valor / 100)::int, p_soma_centavos::int)
    else least(round(p_valor * 100)::int, p_soma_centavos::int)
  end;
$$;

revoke all on function public.cupom_desconto_centavos(text, numeric, bigint) from public, anon, authenticated;

-- ============================================================================
-- 7. VALIDAÇÃO COMUM (prévia e aplicação usam a mesma)
--    Devolve o cupom ou levanta a exceção com a mensagem que o cliente vê.
-- ============================================================================
create or replace function public.cupom_festa_validar(p_festa_id uuid, p_cupom_id uuid, p_cliente_id uuid, p_lock boolean)
returns public.cupons
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  c public.cupons;
  f public.festas;
begin
  if p_lock then
    select * into c from public.cupons where id = p_cupom_id for update;
  else
    select * into c from public.cupons where id = p_cupom_id;
  end if;
  if not found or c.cliente_id is distinct from p_cliente_id then
    raise exception 'Cupom nao encontrado.' using errcode = 'P0001';
  end if;

  select * into f from public.festas where id = p_festa_id;
  if not found then raise exception 'Festa nao encontrada.' using errcode = 'P0001'; end if;
  if f.criador_cliente_id <> p_cliente_id then
    raise exception 'So quem criou a festa pode usar cupom nela.' using errcode = 'P0001';
  end if;

  if c.usado_em is not null then
    raise exception 'Este cupom ja foi utilizado.' using errcode = 'P0001';
  end if;
  if c.expira_em is not null and c.expira_em <= now() then
    raise exception 'Este cupom expirou.' using errcode = 'P0001';
  end if;
  return c;
end;
$$;

revoke all on function public.cupom_festa_validar(uuid, uuid, uuid, boolean) from public, anon, authenticated;

-- ============================================================================
-- 8. PRÉVIA (sem escrever nada) — sobre os carrinhos dos participantes.
--    Só informativa: o valor real sai de `aplicar_cupom_festa`, sobre o
--    `total` autoritativo dos pedidos. Preço do carrinho já foi relido de
--    `produtos` pelo /api/festa/carrinho.
-- ============================================================================
create or replace function public.festa_cupom_previa(p_festa_id uuid, p_cupom_id uuid, p_cliente_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  c        public.cupons;
  r        record;
  v_ids    uuid[]  := '{}';
  v_bases  int[]   := '{}';
  v_soma   bigint  := 0;
  v_d      int;
  v_parc   int[];
  v_ign    jsonb := '[]'::jsonb;
  v_lista  jsonb := '[]'::jsonb;
  i        int;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Somente o servidor consulta a previa.' using errcode = '42501';
  end if;
  c := public.cupom_festa_validar(p_festa_id, p_cupom_id, p_cliente_id, false);

  for r in
    select fp.id as participante_id, fp.cliente_id, cl.nome as participante,
           (fp.itens->0->>'loja_id')::uuid as loja_id, l.nome as loja_nome, l.aceita_cupom,
           coalesce((select sum((e->>'preco')::numeric * (e->>'quantidade')::numeric)
                       from jsonb_array_elements(fp.itens) e), 0) as subtotal
      from public.festa_participantes fp
      join public.clientes cl on cl.id = fp.cliente_id
      left join public.lojas l on l.id = (fp.itens->0->>'loja_id')::uuid
     where fp.festa_id = p_festa_id
       and jsonb_typeof(fp.itens) = 'array' and jsonb_array_length(fp.itens) > 0
       and fp.pedido_id is null
     order by fp.entrou_em, fp.id
  loop
    if r.loja_id is not null and coalesce(r.aceita_cupom, false)
       and (c.loja_id is null or c.loja_id = r.loja_id) then
      v_ids   := v_ids   || r.participante_id;
      v_bases := v_bases || round(r.subtotal * 100)::int;
      v_lista := v_lista || jsonb_build_object(
        'participante_id', r.participante_id, 'participante', r.participante,
        'loja_id', r.loja_id, 'loja', r.loja_nome, 'base', round(r.subtotal, 2), 'elegivel', true);
    else
      v_ign := v_ign || jsonb_build_object(
        'loja_id', r.loja_id, 'loja', r.loja_nome,
        'motivo', case when not coalesce(r.aceita_cupom, false) then 'nao_aceita' else 'outra_loja' end);
      v_lista := v_lista || jsonb_build_object(
        'participante_id', r.participante_id, 'participante', r.participante,
        'loja_id', r.loja_id, 'loja', r.loja_nome, 'base', round(r.subtotal, 2), 'elegivel', false, 'desconto', 0);
    end if;
  end loop;

  select coalesce(sum(b), 0) into v_soma from unnest(v_bases) b;
  if v_soma <= 0 then
    return jsonb_build_object('ok', false, 'motivo', 'Nenhuma loja desta festa aceita este cupom.',
                              'desconto_total', 0, 'lojas_ignoradas', v_ign, 'participantes', v_lista);
  end if;
  if v_soma < round(c.minimo * 100) then
    return jsonb_build_object('ok', false, 'motivo', format('Este cupom exige pedido minimo de R$ %s.', to_char(c.minimo, 'FM999G990D00')),
                              'desconto_total', 0, 'lojas_ignoradas', v_ign, 'participantes', v_lista);
  end if;

  v_d := public.cupom_desconto_centavos(c.tipo, c.valor, v_soma);
  if v_d <= 0 then
    return jsonb_build_object('ok', false, 'motivo', 'O cupom nao gera desconto neste pedido.',
                              'desconto_total', 0, 'lojas_ignoradas', v_ign, 'participantes', v_lista);
  end if;
  v_parc := public.ratear_centavos(v_d, v_bases);

  -- Preenche a parcela dos elegíveis (mesma ordem de v_ids).
  for i in 1..array_length(v_ids, 1) loop
    select jsonb_agg(
      case when (e->>'participante_id')::uuid = v_ids[i]
           then e || jsonb_build_object('desconto', round(v_parc[i] / 100.0, 2))
           else e end)
      into v_lista from jsonb_array_elements(v_lista) e;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'desconto_total', round(v_d / 100.0, 2),
    'valor_cheio', case when c.tipo = 'percentual' then null else c.valor end,
    'parcial', (jsonb_array_length(v_ign) > 0),
    'custeado_por', case when c.loja_id is null then 'plataforma' else 'loja' end,
    'lojas_ignoradas', v_ign,
    'participantes', v_lista);
end;
$$;

revoke all on function public.festa_cupom_previa(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.festa_cupom_previa(uuid, uuid, uuid) to service_role;

-- ============================================================================
-- 9. APLICAÇÃO — uma transação: trava o cupom, rateia sobre o `total` dos
--    pedidos (pós-guard), atualiza pedidos, grava cupom_usos, consome o cupom.
--    Qualquer `raise` desfaz tudo.
-- ============================================================================
create or replace function public.aplicar_cupom_festa(p_festa_id uuid, p_cupom_id uuid, p_cliente_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  c        public.cupons;
  r        record;
  v_ids    uuid[] := '{}';
  v_lojas  uuid[] := '{}';
  v_bases  int[]  := '{}';
  v_soma   bigint := 0;
  v_d      int;
  v_parc   int[];
  v_ign    jsonb := '[]'::jsonb;
  v_lista  jsonb := '[]'::jsonb;
  v_cust   text;
  i        int;
  n_upd    int;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Somente o servidor aplica cupom.' using errcode = '42501';
  end if;
  c := public.cupom_festa_validar(p_festa_id, p_cupom_id, p_cliente_id, true);
  v_cust := case when c.loja_id is null then 'plataforma' else 'loja' end;

  for r in
    select p.id, p.loja_id, p.total, p.taxa_entrega, l.aceita_cupom, l.nome
      from public.pedidos_clientes p
      join public.lojas l on l.id = p.loja_id
     where p.festa_id = p_festa_id and p.status = 'recebido' and p.cupom_id is null
     order by p.created_at, p.id
  loop
    if r.aceita_cupom and (c.loja_id is null or c.loja_id = r.loja_id) then
      v_ids   := v_ids   || r.id;
      v_lojas := v_lojas || r.loja_id;
      v_bases := v_bases || round((r.total - r.taxa_entrega) * 100)::int;
    else
      v_ign := v_ign || jsonb_build_object('loja_id', r.loja_id, 'loja', r.nome,
        'motivo', case when not r.aceita_cupom then 'nao_aceita' else 'outra_loja' end);
    end if;
  end loop;

  select coalesce(sum(b), 0) into v_soma from unnest(v_bases) b;
  if v_soma <= 0 then
    raise exception 'Nenhuma loja desta festa aceita este cupom.' using errcode = 'P0001';
  end if;
  if v_soma < round(c.minimo * 100) then
    raise exception 'Este cupom exige pedido minimo de R$ %.', to_char(c.minimo, 'FM999G990D00') using errcode = 'P0001';
  end if;
  v_d := public.cupom_desconto_centavos(c.tipo, c.valor, v_soma);
  if v_d <= 0 then
    raise exception 'O cupom nao gera desconto neste pedido.' using errcode = 'P0001';
  end if;
  v_parc := public.ratear_centavos(v_d, v_bases);

  -- Escotilha do guard: só nesta transação.
  perform set_config('commerly.cupom_festa', '1', true);
  for i in 1..array_length(v_ids, 1) loop
    update public.pedidos_clientes
       set cupom_id = p_cupom_id,
           desconto_cupom = v_parc[i] / 100.0,
           total = total - v_parc[i] / 100.0
     where id = v_ids[i] and cupom_id is null and status = 'recebido';
    get diagnostics n_upd = row_count;
    if n_upd <> 1 then
      raise exception 'Pedido % mudou durante a aplicacao do cupom.', v_ids[i] using errcode = 'P0001';
    end if;

    insert into public.cupom_usos (cupom_id, festa_id, pedido_id, loja_id, base, desconto, custeado_por)
    values (p_cupom_id, p_festa_id, v_ids[i], v_lojas[i], v_bases[i] / 100.0, v_parc[i] / 100.0, v_cust);

    v_lista := v_lista || jsonb_build_object(
      'pedido_id', v_ids[i], 'loja_id', v_lojas[i], 'base', round(v_bases[i] / 100.0, 2), 'desconto', round(v_parc[i] / 100.0, 2));
  end loop;
  perform set_config('commerly.cupom_festa', '0', true);

  update public.cupons
     set usado_em = now(), festa_id = p_festa_id, desconto_aplicado = v_d / 100.0
   where id = p_cupom_id and usado_em is null;
  get diagnostics n_upd = row_count;
  if n_upd <> 1 then
    raise exception 'Este cupom ja foi utilizado.' using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'ok', true,
    'cupom_id', p_cupom_id, 'codigo', c.codigo,
    'desconto_total', round(v_d / 100.0, 2),
    'custeado_por', v_cust,
    'parcial', (jsonb_array_length(v_ign) > 0),
    'lojas_ignoradas', v_ign,
    'por_pedido', v_lista);
end;
$$;

revoke all on function public.aplicar_cupom_festa(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.aplicar_cupom_festa(uuid, uuid, uuid) to service_role;

-- ============================================================================
-- 10. GUARD — patch sobre o corpo vivo (md5 b655151d…, 2026-09-19)
--     (a) INSERT: cupom nunca entra no insert.
--     (b) UPDATE: escotilha + congelamento dos campos de cupom.
-- ============================================================================
do $$
declare
  v_def text := pg_get_functiondef('public.pedidos_clientes_guard'::regproc);
  v_old_ins text := 'new.garantia_cupom_id := null;';
  v_new_ins text := 'new.garantia_cupom_id := null; new.cupom_id := null; new.desconto_cupom := 0;';
  v_old_upd text := 'new.loja_id := old.loja_id; new.cliente_id := old.cliente_id; new.itens := old.itens;';
  v_new_upd text :=
    '-- CUPOM DE FESTA (2026-09-20): aplicar_cupom_festa() roda como service role' || E'\n' ||
    '    -- com a GUC commerly.cupom_festa ligada na transacao. So nesse caso, e so' || E'\n' ||
    '    -- na forma total = old.total - desconto (desconto <= subtotal), uma vez,' || E'\n' ||
    '    -- em pedido de festa ainda em recebido, o total muda. Todo o resto congela.' || E'\n' ||
    '    if auth.role() = ''service_role''' || E'\n' ||
    '       and current_setting(''commerly.cupom_festa'', true) = ''1''' || E'\n' ||
    '       and old.festa_id is not null and old.status = ''recebido''' || E'\n' ||
    '       and old.cupom_id is null and new.cupom_id is not null' || E'\n' ||
    '       and coalesce(new.desconto_cupom, -1) >= 0' || E'\n' ||
    '       and new.desconto_cupom <= old.total - old.taxa_entrega' || E'\n' ||
    '       and new.total = old.total - new.desconto_cupom then' || E'\n' ||
    '      declare v_cupom_id uuid := new.cupom_id; v_cupom_desc numeric := new.desconto_cupom; v_cupom_total numeric := new.total;' || E'\n' ||
    '      begin' || E'\n' ||
    '        new := old;' || E'\n' ||
    '        new.cupom_id := v_cupom_id; new.desconto_cupom := v_cupom_desc; new.total := v_cupom_total;' || E'\n' ||
    '        new.updated_at := now();' || E'\n' ||
    '        return new;' || E'\n' ||
    '      end;' || E'\n' ||
    '    end if;' || E'\n' ||
    '    new.cupom_id := old.cupom_id; new.desconto_cupom := old.desconto_cupom;' || E'\n' ||
    '    new.loja_id := old.loja_id; new.cliente_id := old.cliente_id; new.itens := old.itens;';
  v_n int;
begin
  if md5(v_def) <> 'b655151d62463833f72e344e76f454ca' then
    raise exception 'Guard mudou desde a leitura (md5 %); releia antes de aplicar.', md5(v_def);
  end if;
  select count(*) into v_n from regexp_matches(v_def, regexp_replace(v_old_ins, '([().])', '\\\1', 'g'), 'g');
  if v_n <> 1 then raise exception 'Trecho INSERT aparece % vez(es), esperado 1.', v_n; end if;
  select count(*) into v_n from regexp_matches(v_def, regexp_replace(v_old_upd, '([().])', '\\\1', 'g'), 'g');
  if v_n <> 1 then raise exception 'Trecho UPDATE aparece % vez(es), esperado 1.', v_n; end if;
  execute replace(replace(v_def, v_old_ins, v_new_ins), v_old_upd, v_new_upd);
end $$;

-- ============================================================================
-- 11. CANCELAMENTO DEVOLVE O CUPOM
--     Trigger na tabela (vale para o cancelamento pela loja e pelo cliente).
--     Idempotente pelo estado líquido: libera quando não resta uso ativo.
--     A validade é estendida pelo tempo em que o cupom ficou consumido.
-- ============================================================================
create or replace function public.cupom_estorno_cancelamento()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_user uuid;
  v_codigo text;
  n_upd int;
begin
  if new.status <> 'cancelado' or old.status is not distinct from 'cancelado' or new.cupom_id is null then
    return null;
  end if;

  update public.cupom_usos set estornado_em = now()
   where pedido_id = new.id and estornado_em is null;

  if exists (select 1 from public.cupom_usos where cupom_id = new.cupom_id and estornado_em is null) then
    return null;  -- ainda há pedido vivo com abatimento: cupom continua consumido
  end if;

  update public.cupons
     set expira_em = case when expira_em is not null and usado_em is not null
                          then expira_em + (now() - usado_em) else expira_em end,
         usado_em = null, festa_id = null, desconto_aplicado = null
   where id = new.cupom_id and usado_em is not null
   returning codigo into v_codigo;
  get diagnostics n_upd = row_count;
  if n_upd = 0 then return null; end if;

  -- Avisa o cliente (tipo 'cupom' já existe no CHECK de notificacoes.tipo).
  begin
    select user_id into v_user from public.clientes where id = new.cliente_id;
    if v_user is not null then
      insert into public.notificacoes (user_id, tipo, titulo, mensagem, link, dados)
      values (v_user, 'cupom', 'Seu cupom voltou 🎁',
              'Os pedidos da festa foram cancelados e o cupom ' || v_codigo || ' esta disponivel de novo.',
              '/cliente/festa', jsonb_build_object('cupom_id', new.cupom_id, 'pedido_id', new.id));
    end if;
  exception when others then
    raise warning '[cupom_estorno_cancelamento] notificacao falhou: %', sqlerrm;
  end;

  return null;
end;
$$;

drop trigger if exists trg_cupom_estorno on public.pedidos_clientes;
create trigger trg_cupom_estorno after update of status on public.pedidos_clientes
  for each row execute function public.cupom_estorno_cancelamento();

commit;

-- ============================================================================
-- CONFERÊNCIA (rodar depois):
--   select md5(pg_get_functiondef('pedidos_clientes_guard'::regproc));
--   select count(*) from information_schema.columns where table_name='lojas_publicas';  -- 21
--   select proname, proacl from pg_proc where proname in ('aplicar_cupom_festa','festa_cupom_previa','ratear_centavos');
--   select public.ratear_centavos(500, array[6000,4000]);   -- {300,200}
--   select public.ratear_centavos(100, array[1000,1000,1000]); -- {34,33,33}
--   select public.ratear_centavos(667, array[3333,3333]);   -- {334,333}
-- ROLLBACK do guard: DO block com v_old/v_new trocados e o md5 de "depois".
-- ============================================================================
