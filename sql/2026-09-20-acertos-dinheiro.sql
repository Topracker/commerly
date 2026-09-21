-- ============================================================================
-- Pagamento em DINHEIRO na entrega — Caminho B + ledger append-only  2026-09-20
-- ----------------------------------------------------------------------------
-- STATUS: APLICADO em produção em 2026-09-20 via MCP (migration
-- acertos_dinheiro_caminho_b_2026_09_20). Testes DO/ROLLBACK: 100% (ver rodapé).
--
-- DECISÃO DE PRODUTO (Caminho B): a Commerly NÃO intermedia o dinheiro. Ela só
-- REGISTRA quem deve quanto a quem e colhe a confirmação das partes. Regra única
-- (a FAQ dizia "acerta com a loja", o código dizia "recebe do cliente"):
--
--   cliente paga o TOTAL ao entregador
--     → entregador fica com TAXA_ENTREGA (a corrida dele)
--     → entregador repassa TOTAL − TAXA_ENTREGA à loja
--     → a LOJA CONFIRMA que recebeu → pagamento_status = 'pago'.
--   Sem entregador (a loja entregou), marcar 'entregue' já é a confirmação.
--
-- O ledger nasce com 4 partes (cliente/entregador/loja/commerly) para virar o
-- Caminho A (carteira intermediada) sem migrar dados: as linhas em que a
-- Commerly é parte passam a ter `referencia_externa` (transfer Stripe) em vez de
-- confirmação manual do admin.
--
-- DÍVIDAS DA COMMERLY que já existiam e ninguém pagava entram no mesmo ledger:
--   • cupom da Garantia (cupom_usos.custeado_por='plataforma'): commerly → loja
--   • bônus de 20% da festa (valor_corrida − taxa_entrega) em dinheiro:
--     commerly → entregador
--
-- O QUE ESTE ARQUIVO FAZ
--   1. pedidos_clientes.troco_para (validado no guard, ≥ total)
--   2. notificacoes.tipo ganha 'acerto'
--   3. acertos_dinheiro (lançamentos, IMUTÁVEIS) + acertos_confirmacoes
--   4. RLS: leitura por vínculo (loja/entregador/cliente); escrita só por
--      trigger e rotas service role. SEM paywall_plano de propósito: loja com
--      plano vencido continua vendo o que tem a receber.
--   5. trigger acertos_gerar_na_entrega (AFTER UPDATE OF status → 'entregue')
--   6. GUARD (patch por replace() sobre o corpo vivo, md5 3625a8c3…):
--      (a) INSERT sem stripe_session_id força pagamento 'entrega'/'pendente'
--          — fecha o buraco do cliente inserir online/pago pela chave anon;
--      (b) INSERT valida troco_para;
--      (c) UPDATE congela pagamento_status/pagamento_corrida/estornado_em/
--          stripe_refund_id/troco_para para quem não é service role;
--      (d) UPDATE: 'entregue' em dinheiro com entregador ⇒ pagamento_corrida
--          'pago' (ele reteve a taxa); sem entregador ⇒ pagamento_status 'pago';
--          e pago→pendente passa a ser barrado ANTES da trava terminal (o bloco
--          antigo ficava depois dela e não valia para pedido já entregue).
--   7. notif_corrida_oferta avisa "💵 dinheiro, cobrar R$ X, troco para R$ Y"
--
-- Regras do CLAUDE.md respeitadas: ADD COLUMN (não CREATE IF NOT EXISTS),
-- guard só por replace() do corpo vivo, CHECK de notificacoes.tipo alterado,
-- RLS testada por REST com JWT real (scripts/testar-acertos-dinheiro.mjs).
-- ============================================================================

begin;

-- ============================================================================
-- 1. troco_para
-- ============================================================================
alter table public.pedidos_clientes add column if not exists troco_para numeric(12,2);
comment on column public.pedidos_clientes.troco_para is
  'Pagamento na entrega: nota com que o cliente vai pagar (troco = troco_para − total). Nulo = sem troco/Pix/valor exato. Validado no guard (≥ total).';

-- ============================================================================
-- 2. notificacoes.tipo += 'acerto'
-- ============================================================================
alter table public.notificacoes drop constraint if exists notificacoes_tipo_check;
alter table public.notificacoes add constraint notificacoes_tipo_check check (tipo = any (array[
  'pedido_novo','pedido_status','parceria_aceita','corrida_oferta','cupom','post_novo','flash_sale',
  'retencao','relatorio','despacho','kit_status','medalha','missao','ranking','cidade','convite',
  'promocao','boas_vindas','entrega_confirmar','acerto'
]));

-- ============================================================================
-- 3. Ledger
-- ============================================================================
create table if not exists public.acertos_dinheiro (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos_clientes(id),
  festa_id uuid references public.festas(id),
  loja_id uuid not null references public.lojas(id),
  entregador_id uuid references public.entregadores(id),
  cliente_id uuid references public.clientes(id),
  de_papel   text not null check (de_papel   in ('cliente','entregador','loja','commerly')),
  para_papel text not null check (para_papel in ('cliente','entregador','loja','commerly')),
  -- cobranca: o que o cliente pagou em dinheiro (para o entregador, ou para a
  --   loja quando ela mesma entregou)
  -- repasse_loja: o que o entregador deve entregar à loja (total − taxa)
  -- bonus_festa: +20% da festa, subsídio da Commerly ao entregador
  -- cupom_garantia: desconto DESCULPA-* que a Commerly deve à loja
  -- estorno: contra-lançamento (estorna_id aponta a linha anulada)
  tipo text not null check (tipo in ('cobranca','repasse_loja','bonus_festa','cupom_garantia','estorno')),
  valor numeric(12,2) not null check (valor > 0),
  estorna_id uuid references public.acertos_dinheiro(id),
  origem text not null,               -- 'trigger_entregue' | 'admin' | 'stripe'
  referencia_externa text,            -- id do transfer/Pix quando houver movimento real
  created_at timestamptz not null default now(),
  check (de_papel <> para_papel),
  check ((tipo = 'estorno') = (estorna_id is not null))
);
comment on table public.acertos_dinheiro is
  'Ledger APPEND-ONLY dos acertos em dinheiro do delivery (Caminho B). Nunca UPDATE/DELETE: corrige-se com uma linha tipo estorno.';

-- Um lançamento vivo por (pedido, tipo): reexecução do 'entregue' não duplica.
create unique index if not exists acertos_um_por_pedido_tipo
  on public.acertos_dinheiro (pedido_id, tipo) where estorna_id is null;
create index if not exists acertos_loja_idx on public.acertos_dinheiro (loja_id, created_at desc);
create index if not exists acertos_entregador_idx on public.acertos_dinheiro (entregador_id, created_at desc);

create table if not exists public.acertos_confirmacoes (
  id uuid primary key default gen_random_uuid(),
  acerto_id uuid not null references public.acertos_dinheiro(id),
  papel text not null check (papel in ('loja','entregador','commerly')),
  resultado text not null check (resultado in ('confirmado','contestado')),
  user_id uuid,                        -- nulo quando origem = 'auto'
  origem text not null,                -- 'app' | 'auto' | 'admin'
  observacao text,
  referencia_externa text,
  created_at timestamptz not null default now()
);
-- Uma confirmação por papel; contestações podem se repetir (histórico).
create unique index if not exists acertos_conf_uma_por_papel
  on public.acertos_confirmacoes (acerto_id, papel) where resultado = 'confirmado';
create index if not exists acertos_conf_acerto_idx on public.acertos_confirmacoes (acerto_id);

-- Imutabilidade: vale até para service role. Errou? Lança um estorno.
create or replace function public.acertos_imutaveis()
returns trigger language plpgsql as $$
begin
  raise exception '% e append-only: nao se altera nem apaga lancamento; registre um estorno.', tg_table_name
    using errcode = 'P0001';
end $$;
drop trigger if exists trg_acertos_imutaveis on public.acertos_dinheiro;
create trigger trg_acertos_imutaveis before update or delete on public.acertos_dinheiro
  for each row execute function public.acertos_imutaveis();
drop trigger if exists trg_acertos_conf_imutaveis on public.acertos_confirmacoes;
create trigger trg_acertos_conf_imutaveis before update or delete on public.acertos_confirmacoes
  for each row execute function public.acertos_imutaveis();

-- ============================================================================
-- 4. RLS — leitura por vínculo, zero escrita para authenticated
-- ============================================================================
alter table public.acertos_dinheiro enable row level security;
alter table public.acertos_confirmacoes enable row level security;

drop policy if exists acertos_select_loja on public.acertos_dinheiro;
create policy acertos_select_loja on public.acertos_dinheiro for select to authenticated
  using (exists (select 1 from public.lojas l where l.id = acertos_dinheiro.loja_id and l.user_id = auth.uid()));
drop policy if exists acertos_select_entregador on public.acertos_dinheiro;
create policy acertos_select_entregador on public.acertos_dinheiro for select to authenticated
  using (exists (select 1 from public.entregadores e where e.id = acertos_dinheiro.entregador_id and e.user_id = auth.uid()));
drop policy if exists acertos_select_cliente on public.acertos_dinheiro;
create policy acertos_select_cliente on public.acertos_dinheiro for select to authenticated
  using (exists (select 1 from public.clientes c where c.id = acertos_dinheiro.cliente_id and c.user_id = auth.uid()));

-- Confirmação é visível para quem vê o lançamento (a RLS de acertos_dinheiro
-- vale dentro do exists, porque a policy roda como o usuário).
drop policy if exists acertos_conf_select on public.acertos_confirmacoes;
create policy acertos_conf_select on public.acertos_confirmacoes for select to authenticated
  using (exists (select 1 from public.acertos_dinheiro a where a.id = acertos_confirmacoes.acerto_id));

-- ============================================================================
-- 5. Geração do ledger no 'entregue'
--    O INSERT do ledger NÃO fica em begin/exception: dinheiro falha alto.
--    Só as notificações são best-effort (padrão dos outros triggers).
-- ============================================================================
create or replace function public.acertos_gerar_na_entrega()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  v_repasse numeric; v_bonus numeric; v_cupom numeric;
  v_acerto_id uuid; v_loja_user uuid; v_ent_user uuid; v_ent_nome text; v_loja_nome text;
begin
  if new.status <> 'entregue' or old.status = 'entregue' then return new; end if;

  if new.pagamento_metodo = 'entrega' then
    if new.entregador_id is not null then
      insert into public.acertos_dinheiro (pedido_id, festa_id, loja_id, entregador_id, cliente_id, de_papel, para_papel, tipo, valor, origem)
      values (new.id, new.festa_id, new.loja_id, new.entregador_id, new.cliente_id, 'cliente', 'entregador', 'cobranca', new.total, 'trigger_entregue')
      on conflict do nothing;

      v_repasse := round(new.total - new.taxa_entrega, 2);
      if v_repasse > 0 then
        insert into public.acertos_dinheiro (pedido_id, festa_id, loja_id, entregador_id, cliente_id, de_papel, para_papel, tipo, valor, origem)
        values (new.id, new.festa_id, new.loja_id, new.entregador_id, new.cliente_id, 'entregador', 'loja', 'repasse_loja', v_repasse, 'trigger_entregue')
        on conflict do nothing
        returning id into v_acerto_id;
      end if;

      -- Bônus da festa: o entregador cobrou só a taxa rateada; o +20% é da Commerly.
      v_bonus := round(coalesce(new.valor_corrida, 0) - new.taxa_entrega, 2);
      if v_bonus > 0 then
        insert into public.acertos_dinheiro (pedido_id, festa_id, loja_id, entregador_id, cliente_id, de_papel, para_papel, tipo, valor, origem)
        values (new.id, new.festa_id, new.loja_id, new.entregador_id, new.cliente_id, 'commerly', 'entregador', 'bonus_festa', v_bonus, 'trigger_entregue')
        on conflict do nothing;
      end if;

      -- Avisos (best-effort): loja tem algo a receber; entregador tem algo a repassar.
      if v_acerto_id is not null then
        begin
          select l.user_id, l.nome into v_loja_user, v_loja_nome from public.lojas l where l.id = new.loja_id;
          select e.user_id, e.nome into v_ent_user, v_ent_nome from public.entregadores e where e.id = new.entregador_id;
          if v_loja_user is not null then
            insert into public.notificacoes (user_id, tipo, titulo, mensagem, link, dados)
            values (v_loja_user, 'acerto', 'Dinheiro a receber 💵',
                    'R$ ' || replace(to_char(v_repasse, 'FM999990.00'), '.', ',') || ' do pedido em dinheiro ficam com ' ||
                    coalesce(v_ent_nome, 'o entregador') || '. Confirme quando receber.',
                    '/pedidos', jsonb_build_object('pedido_id', new.id, 'acerto_id', v_acerto_id));
          end if;
          if v_ent_user is not null then
            insert into public.notificacoes (user_id, tipo, titulo, mensagem, link, dados)
            values (v_ent_user, 'acerto', 'Repasse à loja 💵',
                    'Repasse R$ ' || replace(to_char(v_repasse, 'FM999990.00'), '.', ',') || ' para ' ||
                    coalesce(v_loja_nome, 'a loja') || '. A taxa de entrega é sua.',
                    '/entregador-delivery/dashboard', jsonb_build_object('pedido_id', new.id, 'acerto_id', v_acerto_id));
          end if;
        exception when others then
          raise warning '[acertos_gerar_na_entrega] notificacao falhou: %', sqlerrm;
        end;
      end if;
    else
      -- A própria loja entregou e recebeu: registra e já confirma (origem auto).
      insert into public.acertos_dinheiro (pedido_id, festa_id, loja_id, entregador_id, cliente_id, de_papel, para_papel, tipo, valor, origem)
      values (new.id, new.festa_id, new.loja_id, null, new.cliente_id, 'cliente', 'loja', 'cobranca', new.total, 'trigger_entregue')
      on conflict do nothing
      returning id into v_acerto_id;
      if v_acerto_id is not null then
        insert into public.acertos_confirmacoes (acerto_id, papel, resultado, origem)
        values (v_acerto_id, 'loja', 'confirmado', 'auto');
      end if;
    end if;
  end if;

  -- Cupom da Garantia (qualquer método): a Commerly deve o desconto à loja.
  select sum(u.desconto) into v_cupom
    from public.cupom_usos u
   where u.pedido_id = new.id and u.custeado_por = 'plataforma' and u.estornado_em is null;
  if coalesce(v_cupom, 0) > 0 then
    insert into public.acertos_dinheiro (pedido_id, festa_id, loja_id, entregador_id, cliente_id, de_papel, para_papel, tipo, valor, origem)
    values (new.id, new.festa_id, new.loja_id, new.entregador_id, new.cliente_id, 'commerly', 'loja', 'cupom_garantia', round(v_cupom, 2), 'trigger_entregue')
    on conflict do nothing;
  end if;

  return new;
end $$;

drop trigger if exists trg_acertos_entregue on public.pedidos_clientes;
create trigger trg_acertos_entregue after update of status on public.pedidos_clientes
  for each row execute function public.acertos_gerar_na_entrega();

-- ============================================================================
-- 6. GUARD — 4 patches sobre o corpo vivo (md5 3625a8c3…, 2026-09-20 cupom)
--    Contagem por replace() (não regex: `+` em `now() + make_interval`).
-- ============================================================================
do $$
declare
  v_def text := pg_get_functiondef('public.pedidos_clientes_guard'::regproc);
  -- (a) INSERT: pagamento só é online/pago quando o próprio webhook o diz.
  v_a_old text := 'and nullif(new.stripe_session_id, '''') is not null);';
  v_a_new text := 'and nullif(new.stripe_session_id, '''') is not null);' || E'\n' ||
    '    -- DINHEIRO (2026-09-20): so o webhook (service role + sessao Stripe) cria' || E'\n' ||
    '    -- pedido pago online. Pela chave anon o cliente conseguia se declarar' || E'\n' ||
    '    -- ''online''/''pago'' e a loja via "Pago online" sem ninguem ter pago.' || E'\n' ||
    '    if not pago_online then' || E'\n' ||
    '      new.pagamento_metodo := ''entrega''; new.pagamento_status := ''pendente'';' || E'\n' ||
    '    end if;';
  -- (b) INSERT: troco_para depois do total fechado.
  v_b_old text := 'new.eta_em := now() + make_interval(mins => eta_min);';
  v_b_new text := 'new.eta_em := now() + make_interval(mins => eta_min);' || E'\n\n' ||
    '    -- TROCO (2026-09-20): nota com que o cliente paga; nulo = sem troco/Pix.' || E'\n' ||
    '    if new.pagamento_metodo = ''entrega'' and new.troco_para is not null then' || E'\n' ||
    '      if new.troco_para < new.total then' || E'\n' ||
    '        raise exception ''Valor para troco (R$ %) menor que o total do pedido (R$ %).'', new.troco_para, new.total using errcode = ''P0001'';' || E'\n' ||
    '      end if;' || E'\n' ||
    '      if new.troco_para > new.total + 500 then' || E'\n' ||
    '        raise exception ''Valor para troco muito alto.'' using errcode = ''P0001'';' || E'\n' ||
    '      end if;' || E'\n' ||
    '      new.troco_para := round(new.troco_para, 2);' || E'\n' ||
    '    else' || E'\n' ||
    '      new.troco_para := null;' || E'\n' ||
    '    end if;';
  -- (c) UPDATE: campos de pagamento so mudam por service role.
  v_c_old text := 'new.pagamento_metodo := old.pagamento_metodo;';
  v_c_new text := 'new.pagamento_metodo := old.pagamento_metodo;' || E'\n' ||
    '    new.troco_para := old.troco_para;' || E'\n' ||
    '    -- DINHEIRO (2026-09-20): pagamento e escrito pelas rotas (webhook,' || E'\n' ||
    '    -- cancelar-pedido, acertos/confirmar) e pelo proprio guard abaixo.' || E'\n' ||
    '    if auth.role() <> ''service_role'' then' || E'\n' ||
    '      new.pagamento_status := old.pagamento_status; new.pagamento_corrida := old.pagamento_corrida;' || E'\n' ||
    '      new.estornado_em := old.estornado_em; new.stripe_refund_id := old.stripe_refund_id;' || E'\n' ||
    '    end if;';
  -- (d) UPDATE: entregue em dinheiro.
  v_d_old text := 'if old.status in (''entregue'', ''cancelado'') then';
  v_d_new text :=
    '-- DINHEIRO (2026-09-20): com entregador, ele reteve a taxa do que cobrou' || E'\n' ||
    '    -- (corrida paga); sem entregador, a loja recebeu ela mesma (pedido pago).' || E'\n' ||
    '    -- Feito aqui (BEFORE) para o trigger AFTER do ledger nao precisar de um' || E'\n' ||
    '    -- segundo UPDATE, que voltaria por este guard como ''authenticated''.' || E'\n' ||
    '    if new.status = ''entregue'' and old.status <> ''entregue'' and old.pagamento_metodo = ''entrega'' then' || E'\n' ||
    '      if new.entregador_id is not null then new.pagamento_corrida := ''pago'';' || E'\n' ||
    '      else new.pagamento_status := ''pago''; end if;' || E'\n' ||
    '    end if;' || E'\n' ||
    '    -- pago -> pendente nunca (o bloco antigo, mais abaixo, ficava DEPOIS da' || E'\n' ||
    '    -- trava terminal e nao valia para pedido ja entregue).' || E'\n' ||
    '    if old.pagamento_status = ''pago'' and new.pagamento_status = ''pendente'' then' || E'\n' ||
    '      new.pagamento_status := old.pagamento_status;' || E'\n' ||
    '    end if;' || E'\n\n' ||
    '    if old.status in (''entregue'', ''cancelado'') then';
  v_n int;
begin
  if md5(v_def) <> '3625a8c3360200944b8359994dd5164f' then
    raise exception 'Guard mudou desde a leitura (md5 %); releia antes de aplicar.', md5(v_def);
  end if;
  v_n := (length(v_def) - length(replace(v_def, v_a_old, ''))) / length(v_a_old);
  if v_n <> 1 then raise exception 'Trecho (a) aparece % vez(es), esperado 1.', v_n; end if;
  v_n := (length(v_def) - length(replace(v_def, v_b_old, ''))) / length(v_b_old);
  if v_n <> 1 then raise exception 'Trecho (b) aparece % vez(es), esperado 1.', v_n; end if;
  v_n := (length(v_def) - length(replace(v_def, v_c_old, ''))) / length(v_c_old);
  if v_n <> 1 then raise exception 'Trecho (c) aparece % vez(es), esperado 1.', v_n; end if;
  v_n := (length(v_def) - length(replace(v_def, v_d_old, ''))) / length(v_d_old);
  if v_n <> 1 then raise exception 'Trecho (d) aparece % vez(es), esperado 1.', v_n; end if;
  execute replace(replace(replace(replace(v_def, v_a_old, v_a_new), v_b_old, v_b_new), v_c_old, v_c_new), v_d_old, v_d_new);
end $$;

-- ============================================================================
-- 7. Oferta de corrida avisa que é em dinheiro (md5 ffe46bfb…)
-- ============================================================================
do $$
declare
  v_def text := pg_get_functiondef('public.notif_corrida_oferta'::regproc);
  v_1_old text := 'declare dono uuid; loja_nome text;';
  v_1_new text := 'declare dono uuid; loja_nome text; v_dinheiro text := '''';';
  v_2_old text := 'select nome into loja_nome from public.lojas where id = new.loja_id;';
  v_2_new text := 'select nome into loja_nome from public.lojas where id = new.loja_id;' || E'\n' ||
    '  -- DINHEIRO (2026-09-20): o entregador decide com a informacao completa' || E'\n' ||
    '  -- (quanto cobrar, quanto troco levar). Festa e sempre em dinheiro.' || E'\n' ||
    '  if new.pedido_id is not null then' || E'\n' ||
    '    select case when p.pagamento_metodo = ''entrega'' then' || E'\n' ||
    '             '' · 💵 dinheiro, cobrar R$ '' || replace(to_char(p.total, ''FM999990.00''), ''.'', '','') ||' || E'\n' ||
    '             coalesce('', troco para R$ '' || replace(to_char(p.troco_para, ''FM999990.00''), ''.'', '',''), '''')' || E'\n' ||
    '           else '''' end' || E'\n' ||
    '      into v_dinheiro from public.pedidos_clientes p where p.id = new.pedido_id;' || E'\n' ||
    '  elsif new.festa_id is not null then v_dinheiro := '' · 💵 dinheiro''; end if;' || E'\n' ||
    '  v_dinheiro := coalesce(v_dinheiro, '''');';
  v_3_old text := ''' km. Aceite em 30s.'',';
  v_3_new text := ''' km'' || v_dinheiro || ''. Aceite em 30s.'',';
  v_n int;
begin
  if md5(v_def) <> 'ffe46bfb8614673eaca93d57eba68dd5' then
    raise exception 'notif_corrida_oferta mudou (md5 %); releia antes de aplicar.', md5(v_def);
  end if;
  v_n := (length(v_def) - length(replace(v_def, v_1_old, ''))) / length(v_1_old);
  if v_n <> 1 then raise exception 'Trecho 1 aparece % vez(es).', v_n; end if;
  v_n := (length(v_def) - length(replace(v_def, v_2_old, ''))) / length(v_2_old);
  if v_n <> 1 then raise exception 'Trecho 2 aparece % vez(es).', v_n; end if;
  v_n := (length(v_def) - length(replace(v_def, v_3_old, ''))) / length(v_3_old);
  if v_n <> 1 then raise exception 'Trecho 3 aparece % vez(es).', v_n; end if;
  execute replace(replace(replace(v_def, v_1_old, v_1_new), v_2_old, v_2_new), v_3_old, v_3_new);
end $$;

commit;

-- ============================================================================
-- CONFERÊNCIA (rodar depois):
--   select md5(pg_get_functiondef('pedidos_clientes_guard'::regproc));   -- anotar
--   select md5(pg_get_functiondef('notif_corrida_oferta'::regproc));     -- anotar
--   select column_name from information_schema.columns where table_name='pedidos_clientes' and column_name='troco_para';
--   select count(*) from pg_policy where polrelid in ('acertos_dinheiro'::regclass,'acertos_confirmacoes'::regclass); -- 4
--   select tgname from pg_trigger where tgrelid='pedidos_clientes'::regclass and tgname='trg_acertos_entregue';
--
-- TESTES em DO/ROLLBACK: ver o bloco no fim de scripts/testar-acertos-dinheiro.mjs
-- (parte SQL) — insert anon online/pago vira entrega/pendente; troco < total
-- levanta; update anon de pagamento_status não muda; service role muda;
-- entregue sem entregador ⇒ pago + 1 linha + confirmação auto; com entregador
-- ⇒ 2 linhas (+bonus na festa) e pagamento_corrida pago; UPDATE/DELETE no
-- ledger levantam; reexecução não duplica.
--
-- ROLLBACK do guard: DO block com v_*_old/v_*_new trocados e o md5 de "depois".
--
-- md5 do guard depois do patch:            228429eff53618f32287f976f49cadf8 (antes: 3625a8c3360200944b8359994dd5164f)
-- md5 de notif_corrida_oferta depois:      d544ab2ea5d2c681dedb6b7f0603a38d (antes: ffe46bfb8614673eaca93d57eba68dd5)
-- ============================================================================
