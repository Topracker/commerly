-- ============================================================================
-- Commerly — 2026-07-10
-- IA Copilot, Promoções automáticas, Combos, Campanha de retorno,
-- Commerly Ads, Financeiro (DAS MEI), Marketplace B2B, Clube Commerly,
-- PagBank OAuth.
--
-- Idempotente: pode rodar mais de uma vez sem quebrar.
-- ============================================================================

-- ─── 1. IA COPILOT ──────────────────────────────────────────────────────────
-- Insights gerados 1x por semana (cache): evita gastar cota do Gemini a cada
-- abertura do dashboard.
create table if not exists public.insights_semanais (
  id         uuid primary key default gen_random_uuid(),
  loja_id    uuid not null references public.lojas(id) on delete cascade,
  semana     date not null,           -- segunda-feira da semana (UTC)
  insights   jsonb not null,          -- [{ titulo, texto, acao, rota }]
  created_at timestamptz not null default now(),
  unique (loja_id, semana)
);
alter table public.insights_semanais enable row level security;

drop policy if exists insights_loja_all on public.insights_semanais;
create policy insights_loja_all on public.insights_semanais
  for all using (loja_id in (select id from public.lojas where user_id = auth.uid()))
  with check (loja_id in (select id from public.lojas where user_id = auth.uid()));


-- ─── 2. PROMOÇÕES AUTOMÁTICAS ───────────────────────────────────────────────
-- Uma regra por loja: "produto sem vender há X dias ganha Y% de desconto".
create table if not exists public.promocao_regras (
  id             uuid primary key default gen_random_uuid(),
  loja_id        uuid not null unique references public.lojas(id) on delete cascade,
  ativa          boolean not null default false,
  dias_sem_venda int not null default 30 check (dias_sem_venda between 1 and 365),
  desconto_pct   int not null default 10 check (desconto_pct between 1 and 90),
  updated_at     timestamptz not null default now()
);
alter table public.promocao_regras enable row level security;

drop policy if exists promo_regras_loja_all on public.promocao_regras;
create policy promo_regras_loja_all on public.promocao_regras
  for all using (loja_id in (select id from public.lojas where user_id = auth.uid()))
  with check (loja_id in (select id from public.lojas where user_id = auth.uid()));

-- Promoção concreta aplicada a um produto.
create table if not exists public.promocoes (
  id                uuid primary key default gen_random_uuid(),
  loja_id           uuid not null references public.lojas(id) on delete cascade,
  produto_id        uuid not null references public.produtos(id) on delete cascade,
  desconto_pct      int not null check (desconto_pct between 1 and 90),
  preco_original    numeric(10,2) not null,
  preco_promocional numeric(10,2) not null,
  origem            text not null default 'automatica' check (origem in ('automatica','manual')),
  ativa             boolean not null default true,
  created_at        timestamptz not null default now(),
  expira_em         timestamptz
);
-- No máximo uma promoção ATIVA por produto.
create unique index if not exists promocoes_produto_ativa_uniq
  on public.promocoes (produto_id) where ativa;
create index if not exists promocoes_loja_ativa_idx on public.promocoes (loja_id) where ativa;

alter table public.promocoes enable row level security;

-- Promoção é oferta pública: cliente precisa enxergar na página da loja.
drop policy if exists promocoes_select_public on public.promocoes;
create policy promocoes_select_public on public.promocoes for select using (true);

drop policy if exists promocoes_loja_write on public.promocoes;
create policy promocoes_loja_write on public.promocoes
  for all using (loja_id in (select id from public.lojas where user_id = auth.uid()))
  with check (loja_id in (select id from public.lojas where user_id = auth.uid()));


-- ─── 3. COMBOS INTELIGENTES ─────────────────────────────────────────────────
-- As SUGESTÕES são calculadas na hora (market-basket sobre pedidos_clientes.itens).
-- Esta tabela guarda só os combos que o comerciante aceitou publicar.
create table if not exists public.combos (
  id           uuid primary key default gen_random_uuid(),
  loja_id      uuid not null references public.lojas(id) on delete cascade,
  nome         text not null,
  produto_ids  uuid[] not null check (array_length(produto_ids, 1) >= 2),
  desconto_pct int not null default 10 check (desconto_pct between 1 and 90),
  preco        numeric(10,2) not null,   -- preço final já com desconto
  vezes_juntos int not null default 0,   -- evidência que originou a sugestão
  ativo        boolean not null default true,
  created_at   timestamptz not null default now()
);
create index if not exists combos_loja_ativo_idx on public.combos (loja_id) where ativo;

alter table public.combos enable row level security;

drop policy if exists combos_select_public on public.combos;
create policy combos_select_public on public.combos for select using (true);

drop policy if exists combos_loja_write on public.combos;
create policy combos_loja_write on public.combos
  for all using (loja_id in (select id from public.lojas where user_id = auth.uid()))
  with check (loja_id in (select id from public.lojas where user_id = auth.uid()));


-- ─── 4. CUPONS + CAMPANHA DE RETORNO ────────────────────────────────────────
create table if not exists public.cupons (
  id         uuid primary key default gen_random_uuid(),
  codigo     text not null unique,
  loja_id    uuid references public.lojas(id) on delete cascade,  -- null = vale em qualquer loja
  cliente_id uuid references public.clientes(id) on delete cascade,
  tipo       text not null default 'percentual' check (tipo in ('percentual','valor')),
  valor      numeric(10,2) not null check (valor > 0),
  minimo     numeric(10,2) not null default 0,
  origem     text not null default 'retorno',
  expira_em  timestamptz,
  usado_em   timestamptz,
  pedido_id  uuid references public.pedidos_clientes(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists cupons_cliente_idx on public.cupons (cliente_id) where usado_em is null;
create index if not exists cupons_loja_idx on public.cupons (loja_id);

alter table public.cupons enable row level security;

drop policy if exists cupons_select_dono on public.cupons;
create policy cupons_select_dono on public.cupons for select using (
  cliente_id in (select id from public.clientes where user_id = auth.uid())
  or loja_id in (select id from public.lojas where user_id = auth.uid())
);

drop policy if exists cupons_loja_write on public.cupons;
create policy cupons_loja_write on public.cupons
  for all using (loja_id in (select id from public.lojas where user_id = auth.uid()))
  with check (loja_id in (select id from public.lojas where user_id = auth.uid()));

-- Log de envio, para não bombardear o mesmo cliente toda semana.
create table if not exists public.campanhas_retorno (
  id         uuid primary key default gen_random_uuid(),
  loja_id    uuid not null references public.lojas(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  cupom_id   uuid references public.cupons(id) on delete set null,
  enviada_em timestamptz not null default now()
);
create index if not exists campanhas_retorno_loja_cliente_idx
  on public.campanhas_retorno (loja_id, cliente_id, enviada_em desc);

alter table public.campanhas_retorno enable row level security;

drop policy if exists campanhas_loja_all on public.campanhas_retorno;
create policy campanhas_loja_all on public.campanhas_retorno
  for all using (loja_id in (select id from public.lojas where user_id = auth.uid()))
  with check (loja_id in (select id from public.lojas where user_id = auth.uid()));


-- ─── 5. COMMERLY ADS ────────────────────────────────────────────────────────
alter table public.lojas add column if not exists destaque_ate timestamptz;
alter table public.lojas add column if not exists stripe_ads_subscription_id text;

-- A view pública ganha o flag de destaque (a busca ordena e mostra o badge).
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
         distancia_maxima_entrega,
         website_url,
         created_at,
         stripe_onboarded = true and stripe_account_id is not null as aceita_pagamento_online,
         (destaque_ate is not null and destaque_ate > now()) as destaque
    from public.lojas;


-- ─── 6. FINANCEIRO (DAS MEI) ────────────────────────────────────────────────
-- `custo` e `preco_venda` já existem em produtos (lucro real sai daí).
-- Guardamos só o regime/atividade; o valor do DAS é calculado no app a partir
-- do salário mínimo vigente (ver app/lib/financeiro.ts).
alter table public.lojas add column if not exists regime text not null default 'mei'
  check (regime in ('mei','simples','outro'));
alter table public.lojas add column if not exists mei_atividade text not null default 'comercio'
  check (mei_atividade in ('comercio','servicos','ambos'));


-- ─── 7. MARKETPLACE B2B ─────────────────────────────────────────────────────
alter table public.fornecedores add column if not exists stripe_account_id text;
alter table public.fornecedores add column if not exists stripe_onboarded boolean not null default false;

alter table public.fornecedor_produtos add column if not exists estoque int;
alter table public.fornecedor_produtos add column if not exists unidade text not null default 'un';
alter table public.fornecedor_produtos add column if not exists minimo_pedido int not null default 1
  check (minimo_pedido >= 1);
alter table public.fornecedor_produtos add column if not exists ativo boolean not null default true;

-- Comissão da plataforma no pedido B2B (5%) + rastreio do pagamento Stripe.
alter table public.pedidos add column if not exists comissao numeric(10,2);
alter table public.pedidos add column if not exists stripe_session_id text;
alter table public.pedidos add column if not exists stripe_payment_intent text;
alter table public.pedidos add column if not exists pagamento_status text not null default 'pendente'
  check (pagamento_status in ('pendente','pago','reembolsado','falhou'));
alter table public.pedidos add column if not exists pagamento_metodo text;

create index if not exists pedidos_stripe_session_idx on public.pedidos (stripe_session_id);


-- ─── 8. CLUBE COMMERLY (pontos valem em qualquer loja) ──────────────────────
-- `pontos_clientes` (saldo por loja) continua sendo a fonte da verdade; o Clube
-- é a camada global: saldo = soma dos saldos, e o resgate debita entre lojas.
create or replace view public.clube_saldo as
  select cliente_id,
         sum(saldo)::int           as saldo,
         sum(total_acumulado)::int as total_acumulado
    from public.pontos_clientes
   group by cliente_id;

-- OBRIGATÓRIO: sem security_invoker a view roda como o criador e ignora a RLS
-- de pontos_clientes, expondo o saldo de TODOS os clientes.
alter view public.clube_saldo set (security_invoker = true);

create table if not exists public.clube_movimentos (
  id         uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  loja_id    uuid references public.lojas(id) on delete set null,
  pedido_id  uuid references public.pedidos_clientes(id) on delete set null,
  tipo       text not null check (tipo in ('ganho','resgate')),
  pontos     int not null check (pontos > 0),
  created_at timestamptz not null default now()
);
create index if not exists clube_mov_cliente_idx on public.clube_movimentos (cliente_id, created_at desc);

alter table public.clube_movimentos enable row level security;

drop policy if exists clube_mov_select on public.clube_movimentos;
create policy clube_mov_select on public.clube_movimentos for select using (
  cliente_id in (select id from public.clientes where user_id = auth.uid())
  or loja_id in (select id from public.lojas where user_id = auth.uid())
);

-- Resgata `p_pontos` do saldo GLOBAL do cliente, debitando das lojas com maior
-- saldo primeiro. Retorna quantos pontos foram efetivamente debitados.
-- SECURITY DEFINER: valida o dono (ou aceita chamada com service_role).
create or replace function public.resgatar_pontos_clube(
  p_cliente_id uuid,
  p_loja_id    uuid,
  p_pontos     int,
  p_pedido_id  uuid default null
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_restante int := p_pontos;
  v_total    int;
  v_debita   int;
  r          record;
begin
  if p_pontos is null or p_pontos <= 0 then
    raise exception 'pontos deve ser positivo';
  end if;

  -- Chamada pelo servidor (service_role) passa; pelo cliente, só o dono.
  if coalesce(auth.role(), '') <> 'service_role'
     and not exists (
       select 1 from public.clientes c
        where c.id = p_cliente_id and c.user_id = auth.uid()
     )
  then
    raise exception 'nao autorizado';
  end if;

  select coalesce(sum(saldo), 0) into v_total
    from public.pontos_clientes where cliente_id = p_cliente_id;

  if v_total < p_pontos then
    raise exception 'saldo insuficiente: % pontos disponiveis', v_total;
  end if;

  for r in
    select id, saldo from public.pontos_clientes
     where cliente_id = p_cliente_id and saldo > 0
     order by saldo desc
     for update
  loop
    exit when v_restante <= 0;
    v_debita := least(r.saldo, v_restante);
    update public.pontos_clientes
       set saldo = saldo - v_debita, updated_at = now()
     where id = r.id;
    v_restante := v_restante - v_debita;
  end loop;

  insert into public.clube_movimentos (cliente_id, loja_id, pedido_id, tipo, pontos)
  values (p_cliente_id, p_loja_id, p_pedido_id, 'resgate', p_pontos - v_restante);

  return p_pontos - v_restante;
end;
$$;

revoke all on function public.resgatar_pontos_clube(uuid, uuid, int, uuid) from public;
revoke all on function public.resgatar_pontos_clube(uuid, uuid, int, uuid) from anon;
grant execute on function public.resgatar_pontos_clube(uuid, uuid, int, uuid) to authenticated, service_role;


-- ─── 9. PAGBANK OAUTH ───────────────────────────────────────────────────────
-- O fluxo antigo (email + token manual) continua valendo; o OAuth preenche
-- access_token/refresh_token. Por isso email/token viram opcionais.
alter table public.pagbank_conexoes add column if not exists access_token text;
alter table public.pagbank_conexoes add column if not exists refresh_token text;
alter table public.pagbank_conexoes add column if not exists expires_at timestamptz;
alter table public.pagbank_conexoes add column if not exists pb_account_id text;
alter table public.pagbank_conexoes add column if not exists updated_at timestamptz not null default now();

alter table public.pagbank_conexoes alter column email drop not null;
alter table public.pagbank_conexoes alter column token drop not null;
