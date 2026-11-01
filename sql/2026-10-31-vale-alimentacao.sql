-- ============================================================================
-- Vale-alimentação / vale-refeição (VA/VR) na maquininha da loja   2026-10-31
-- ----------------------------------------------------------------------------
-- STATUS: NÃO APLICADO em produção (o dono roda no SQL Editor do Supabase).
-- Testado em DO/ROLLBACK contra o banco de produção em 2026-10-31 (ver rodapé).
--
-- A Commerly NÃO processa o vale: o cliente paga na MAQUININHA DA LOJA, na
-- porta (o entregador leva a maquininha) ou quando a própria loja entrega. É
-- uma forma de pagamento "na entrega" como o dinheiro (Caminho B,
-- sql/2026-09-20-acertos-dinheiro.sql), com o acerto invertido:
--
--   dinheiro: cliente → entregador (total); entregador → loja (total − taxa)
--   vale:     cliente → loja (total, na maquininha dela); loja → entregador (taxa)
--
--   • a LOJA confirma que o vale passou (cobranca) → pagamento_status = 'pago'
--     (rota /api/acertos/confirmar, igual ao repasse em dinheiro);
--   • o ENTREGADOR confirma que recebeu a corrida (repasse_entregador)
--     → pagamento_corrida = 'pago';
--   • sem entregador (a loja entregou), marcar 'entregue' já é a confirmação
--     (mesma regra do dinheiro; o guard já faz pagamento_status = 'pago').
--
-- O QUE ESTE ARQUIVO FAZ
--   1. lojas.aceita_vale + lojas.vale_bandeiras (default desligado / vazio)
--   2. lojas_publicas ganha as 2 colunas NO FIM (create or replace: se alguém
--      tiver mudado a view, o Postgres recusa em vez de perder coluna)
--   3. pedidos_clientes.forma_pagamento ('dinheiro'|'vale') + vale_bandeira
--   4. trigger NOVO pedidos_vale_guard (BEFORE INSERT OR UPDATE, roda DEPOIS do
--      pedidos_clientes_guard por ordem alfabética do nome do trigger).
--      O GUARD DE PREÇO NÃO É TOCADO (md5 228429ef… conferido no fim).
--   5. acertos_dinheiro.tipo += 'repasse_entregador'
--   6. acertos_gerar_na_entrega: ramo do vale (patch por replace() no corpo
--      vivo, md5 3a78e977…)
--   7. notif_corrida_oferta: a oferta diz "💳 vale Alelo na maquininha da loja"
--      (patch por replace() no corpo vivo, md5 d544ab2e…)
--
-- Sem integração com operadora de vale. Sem taxa extra. Sem cobrança online.
-- ============================================================================

begin;

-- ============================================================================
-- 1. Configuração da loja
-- ============================================================================
alter table public.lojas add column if not exists aceita_vale boolean not null default false;
alter table public.lojas add column if not exists vale_bandeiras text[] not null default '{}';

alter table public.lojas drop constraint if exists lojas_vale_bandeiras_check;
alter table public.lojas add constraint lojas_vale_bandeiras_check
  check (vale_bandeiras <@ array['alelo','vr','ticket','pluxee','caju','flash','outros']::text[]);
alter table public.lojas drop constraint if exists lojas_aceita_vale_bandeira_check;
alter table public.lojas add constraint lojas_aceita_vale_bandeira_check
  check (not aceita_vale or cardinality(vale_bandeiras) > 0);

comment on column public.lojas.aceita_vale is
  'Aceita VA/VR na maquininha da própria loja (pago na entrega). A Commerly não processa o vale.';
comment on column public.lojas.vale_bandeiras is
  'Bandeiras de vale aceitas: alelo, vr, ticket, pluxee, caju, flash, outros.';

-- ============================================================================
-- 2. lojas_publicas — as 22 colunas vivas (pg_get_viewdef de 2026-10-31) + 2
--    no fim. NÃO filtrar por disponivel aqui (ver lojas_publicas_view_trap).
-- ============================================================================
create or replace view public.lojas_publicas with (security_invoker = false) as
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
    aceita_cupom,
    oculta,
    aceita_vale,
    vale_bandeiras
   from public.lojas;

-- ============================================================================
-- 3. Forma de pagamento do pedido
-- ============================================================================
alter table public.pedidos_clientes add column if not exists forma_pagamento text;
alter table public.pedidos_clientes add column if not exists vale_bandeira text;

alter table public.pedidos_clientes drop constraint if exists pedidos_clientes_forma_pagamento_check;
alter table public.pedidos_clientes add constraint pedidos_clientes_forma_pagamento_check
  check (forma_pagamento is null or forma_pagamento in ('dinheiro','vale'));
alter table public.pedidos_clientes drop constraint if exists pedidos_clientes_vale_bandeira_check;
alter table public.pedidos_clientes add constraint pedidos_clientes_vale_bandeira_check
  check ((coalesce(forma_pagamento, '') = 'vale') = (vale_bandeira is not null)
         and (vale_bandeira is null or vale_bandeira in ('alelo','vr','ticket','pluxee','caju','flash','outros')));

comment on column public.pedidos_clientes.forma_pagamento is
  'Só quando pagamento_metodo = entrega: dinheiro (dinheiro/Pix ao entregador) ou vale (VA/VR na maquininha da loja). Nulo = online ou pedido anterior a 2026-10-31.';
comment on column public.pedidos_clientes.vale_bandeira is
  'Bandeira do vale escolhida pelo cliente (só com forma_pagamento = vale). Validada contra lojas.vale_bandeiras no trigger pedidos_vale_guard.';

create or replace function public.vale_bandeira_label(b text)
returns text language sql immutable as $$
  select case b
    when 'alelo' then 'Alelo' when 'vr' then 'VR' when 'ticket' then 'Ticket'
    when 'pluxee' then 'Pluxee (Sodexo)' when 'caju' then 'Caju' when 'flash' then 'Flash'
    else 'Outros' end
$$;

-- ============================================================================
-- 4. pedidos_vale_guard — roda depois do pedidos_clientes_guard
--    ('trg_pedidos_vale' > 'trg_pedidos_clientes_guard'), então já enxerga o
--    pagamento_metodo forçado por ele. SECURITY DEFINER porque o cliente não lê
--    `lojas` (RLS owner-only).
-- ============================================================================
create or replace function public.pedidos_vale_guard()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  v_aceita boolean; v_bandeiras text[];
begin
  if tg_op = 'INSERT' then
    if new.pagamento_metodo = 'online' then
      new.forma_pagamento := null; new.vale_bandeira := null;
      return new;
    end if;

    if new.forma_pagamento = 'vale' then
      if new.festa_id is not null then
        raise exception 'Vale não está disponível no Modo Festa.' using errcode = 'P0001';
      end if;
      select l.aceita_vale, l.vale_bandeiras into v_aceita, v_bandeiras
        from public.lojas l where l.id = new.loja_id;
      if not coalesce(v_aceita, false) then
        raise exception 'Esta loja não aceita vale.' using errcode = 'P0001';
      end if;
      if new.vale_bandeira is null or not (new.vale_bandeira = any(v_bandeiras)) then
        raise exception 'Esta loja não aceita essa bandeira de vale.' using errcode = 'P0001';
      end if;
      -- Vale não tem troco.
      new.troco_para := null;
    else
      new.forma_pagamento := 'dinheiro'; new.vale_bandeira := null;
    end if;
    return new;
  end if;

  -- UPDATE: a forma é do momento do pedido; ninguém troca depois (nem service role).
  new.forma_pagamento := old.forma_pagamento;
  new.vale_bandeira := old.vale_bandeira;

  -- Vale com entregador: o guard marca a corrida 'pago' no 'entregue' porque no
  -- dinheiro o entregador retém a taxa. No vale o dinheiro foi para a loja; a
  -- corrida fica pendente até o entregador confirmar o repasse da loja.
  if old.forma_pagamento = 'vale' and new.status = 'entregue' and old.status <> 'entregue'
     and new.entregador_id is not null and coalesce(new.taxa_entrega, 0) > 0 then
    new.pagamento_corrida := old.pagamento_corrida;
  end if;
  return new;
end $$;

drop trigger if exists trg_pedidos_vale on public.pedidos_clientes;
create trigger trg_pedidos_vale before insert or update on public.pedidos_clientes
  for each row execute function public.pedidos_vale_guard();

-- ============================================================================
-- 5. Ledger: a loja deve a corrida ao entregador
-- ============================================================================
alter table public.acertos_dinheiro drop constraint if exists acertos_dinheiro_tipo_check;
alter table public.acertos_dinheiro add constraint acertos_dinheiro_tipo_check
  check (tipo in ('cobranca','repasse_loja','repasse_entregador','bonus_festa','cupom_garantia','estorno'));

-- ============================================================================
-- 6. acertos_gerar_na_entrega — ramo do vale antes do ramo do dinheiro
-- ============================================================================
do $$
declare
  v_def text := pg_get_functiondef('public.acertos_gerar_na_entrega'::regproc);
  v_1_old text := 'v_acerto_id uuid;';
  v_1_new text := 'v_acerto_id uuid; v_corrida_id uuid; v_band text;';
  v_2_old text := 'if new.pagamento_metodo = ''entrega'' then';
  v_2_new text :=
    '-- VALE (2026-10-31): o cliente pagou na maquininha da LOJA. O dinheiro ja' || E'\n' ||
    '  -- esta com ela; a loja confirma que o vale passou e deve a corrida.' || E'\n' ||
    '  if new.pagamento_metodo = ''entrega'' and new.forma_pagamento = ''vale'' then' || E'\n' ||
    '    v_band := public.vale_bandeira_label(new.vale_bandeira);' || E'\n' ||
    '    insert into public.acertos_dinheiro (pedido_id, festa_id, loja_id, entregador_id, cliente_id, de_papel, para_papel, tipo, valor, origem)' || E'\n' ||
    '    values (new.id, new.festa_id, new.loja_id, new.entregador_id, new.cliente_id, ''cliente'', ''loja'', ''cobranca'', new.total, ''trigger_entregue'')' || E'\n' ||
    '    on conflict do nothing' || E'\n' ||
    '    returning id into v_acerto_id;' || E'\n' ||
    '    if new.entregador_id is null then' || E'\n' ||
    '      if v_acerto_id is not null then' || E'\n' ||
    '        insert into public.acertos_confirmacoes (acerto_id, papel, resultado, origem)' || E'\n' ||
    '        values (v_acerto_id, ''loja'', ''confirmado'', ''auto'');' || E'\n' ||
    '      end if;' || E'\n' ||
    '    else' || E'\n' ||
    '      v_repasse := round(coalesce(new.taxa_entrega, 0), 2);' || E'\n' ||
    '      if v_repasse > 0 then' || E'\n' ||
    '        insert into public.acertos_dinheiro (pedido_id, festa_id, loja_id, entregador_id, cliente_id, de_papel, para_papel, tipo, valor, origem)' || E'\n' ||
    '        values (new.id, new.festa_id, new.loja_id, new.entregador_id, new.cliente_id, ''loja'', ''entregador'', ''repasse_entregador'', v_repasse, ''trigger_entregue'')' || E'\n' ||
    '        on conflict do nothing' || E'\n' ||
    '        returning id into v_corrida_id;' || E'\n' ||
    '      end if;' || E'\n' ||
    '      begin' || E'\n' ||
    '        select l.user_id, l.nome into v_loja_user, v_loja_nome from public.lojas l where l.id = new.loja_id;' || E'\n' ||
    '        select e.user_id, e.nome into v_ent_user, v_ent_nome from public.entregadores e where e.id = new.entregador_id;' || E'\n' ||
    '        if v_loja_user is not null and v_acerto_id is not null then' || E'\n' ||
    '          insert into public.notificacoes (user_id, tipo, titulo, mensagem, link, dados)' || E'\n' ||
    '          values (v_loja_user, ''acerto'', ''Confirme o vale 💳'',' || E'\n' ||
    '                  ''R$ '' || replace(to_char(new.total, ''FM999990.00''), ''.'', '','') || '' no vale '' || v_band ||' || E'\n' ||
    '                  ''. Confira na maquininha e confirme o recebimento.'' ||' || E'\n' ||
    '                  case when v_corrida_id is not null then '' A corrida (R$ '' || replace(to_char(v_repasse, ''FM999990.00''), ''.'', '','') || '') você paga a '' || coalesce(v_ent_nome, ''o entregador'') || ''.'' else '''' end,' || E'\n' ||
    '                  ''/pedidos'', jsonb_build_object(''pedido_id'', new.id, ''acerto_id'', v_acerto_id));' || E'\n' ||
    '        end if;' || E'\n' ||
    '        if v_ent_user is not null and v_corrida_id is not null then' || E'\n' ||
    '          insert into public.notificacoes (user_id, tipo, titulo, mensagem, link, dados)' || E'\n' ||
    '          values (v_ent_user, ''acerto'', ''Corrida a receber 💳'',' || E'\n' ||
    '                  ''Pedido no vale: o valor foi para '' || coalesce(v_loja_nome, ''a loja'') || ''. Ela te paga a corrida de R$ '' ||' || E'\n' ||
    '                  replace(to_char(v_repasse, ''FM999990.00''), ''.'', '','') || ''. Confirme quando receber.'',' || E'\n' ||
    '                  ''/entregador-delivery/dashboard'', jsonb_build_object(''pedido_id'', new.id, ''acerto_id'', v_corrida_id));' || E'\n' ||
    '        end if;' || E'\n' ||
    '      exception when others then' || E'\n' ||
    '        raise warning ''[acertos_gerar_na_entrega] notificacao do vale falhou: %'', sqlerrm;' || E'\n' ||
    '      end;' || E'\n' ||
    '    end if;' || E'\n' ||
    '  elsif new.pagamento_metodo = ''entrega'' then';
  v_n int;
begin
  if md5(v_def) <> '3a78e9772d7601e8f10014e3148e12d8' then
    raise exception 'acertos_gerar_na_entrega mudou (md5 %); releia antes de aplicar.', md5(v_def);
  end if;
  v_n := (length(v_def) - length(replace(v_def, v_1_old, ''))) / length(v_1_old);
  if v_n <> 1 then raise exception 'Trecho 1 aparece % vez(es), esperado 1.', v_n; end if;
  v_n := (length(v_def) - length(replace(v_def, v_2_old, ''))) / length(v_2_old);
  if v_n <> 1 then raise exception 'Trecho 2 aparece % vez(es), esperado 1.', v_n; end if;
  execute replace(replace(v_def, v_1_old, v_1_new), v_2_old, v_2_new);
end $$;

-- ============================================================================
-- 7. Oferta de corrida avisa que é no vale (e que precisa da maquininha)
-- ============================================================================
do $$
declare
  v_def text := pg_get_functiondef('public.notif_corrida_oferta'::regproc);
  v_old text := 'select case when p.pagamento_metodo = ''entrega'' then';
  v_new text := 'select case when p.pagamento_metodo = ''entrega'' and p.forma_pagamento = ''vale'' then' || E'\n' ||
    '             '' · 💳 vale '' || public.vale_bandeira_label(p.vale_bandeira) || '' na maquininha da loja, cobrar R$ '' ||' || E'\n' ||
    '             replace(to_char(p.total, ''FM999990.00''), ''.'', '','') || '' (pegue a maquininha na loja)''' || E'\n' ||
    '           when p.pagamento_metodo = ''entrega'' then';
  v_n int;
begin
  if md5(v_def) <> 'd544ab2ea5d2c681dedb6b7f0603a38d' then
    raise exception 'notif_corrida_oferta mudou (md5 %); releia antes de aplicar.', md5(v_def);
  end if;
  v_n := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
  if v_n <> 1 then raise exception 'Trecho aparece % vez(es), esperado 1.', v_n; end if;
  execute replace(v_def, v_old, v_new);
end $$;

-- O guard de preço continua o mesmo.
do $$
begin
  if md5(pg_get_functiondef('public.pedidos_clientes_guard'::regproc)) <> '228429eff53618f32287f976f49cadf8' then
    raise exception 'pedidos_clientes_guard não é o esperado; abortando.';
  end if;
end $$;

commit;

-- ============================================================================
-- CONFERÊNCIA (rodar depois):
--   select column_name from information_schema.columns where table_schema='public'
--     and ((table_name='lojas' and column_name in ('aceita_vale','vale_bandeiras'))
--       or (table_name='lojas_publicas' and column_name in ('aceita_vale','vale_bandeiras','oculta','aceita_cupom'))
--       or (table_name='pedidos_clientes' and column_name in ('forma_pagamento','vale_bandeira')));   -- 8 linhas
--   select tgname from pg_trigger where tgrelid='public.pedidos_clientes'::regclass and tgname='trg_pedidos_vale';
--   select md5(pg_get_functiondef('public.pedidos_clientes_guard'::regproc));   -- 228429ef… (intocado)
--   select md5(pg_get_functiondef('public.acertos_gerar_na_entrega'::regproc));
--   select md5(pg_get_functiondef('public.notif_corrida_oferta'::regproc));
--   -- a view continua pública (JWT anon): GET /rest/v1/lojas_publicas?select=id,aceita_vale&limit=1
-- ============================================================================
