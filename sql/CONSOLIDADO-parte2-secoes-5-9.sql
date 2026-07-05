-- ============================================================================
-- COMMERLY - CONSOLIDADO PARTE 2/3 (secoes 5-9)
-- entregadores.pagamento_manual | Funcoes de taxa | pedidos_clientes |
-- pontos_clientes | pedidos_pendentes
--
-- Rode DEPOIS da Parte 1. Ordem: Parte 1 -> Parte 2 -> Parte 3.
-- Idempotente e envolto em begin/commit (all-or-nothing).
-- ASSUME que a tabela public.entregadores ja existe (entregadores.sql aplicado).
-- ============================================================================

begin;

-- ============================================================================
-- 5. ENTREGADOR - flag de pagamento manual (fallback quando Connect falha).
--    (A tabela entregadores ja existe; so a coluna e nova.)
-- ============================================================================
alter table public.entregadores
  add column if not exists pagamento_manual boolean not null default false;

-- ============================================================================
-- 6. FUNCOES DE TAXA - Haversine (km) + taxa dinamica por km (modelo final).
-- ============================================================================
create or replace function public.haversine_km(
  lat1 double precision, lng1 double precision,
  lat2 double precision, lng2 double precision
) returns numeric
language sql immutable as $$
  select case
    when lat1 is null or lng1 is null or lat2 is null or lng2 is null then null
    else round((2 * 6371 * asin(sqrt(
      power(sin(radians(lat2 - lat1) / 2), 2) +
      cos(radians(lat1)) * cos(radians(lat2)) *
      power(sin(radians(lng2 - lng1) / 2), 2)
    )))::numeric, 3)
  end
$$;

-- Modelo DINAMICO (iFood-like): base 3 + 1/km, minimo 3, maximo 25.
create or replace function public.calcular_taxa_entrega(dist_km numeric)
returns numeric
language sql immutable as $$
  select round(
    least(25, greatest(3, 3 + 1 * coalesce(dist_km, 0)))::numeric
  , 2)
$$;

-- ============================================================================
-- 7. TABELA pedidos_clientes - base + TODAS as colunas das migrations do chain.
--    (create-if-not-exists com a base; add-if-not-exists p/ o resto, cobrindo
--     tanto criacao do zero quanto tabela parcial ja existente em producao.)
-- ============================================================================
create table if not exists public.pedidos_clientes (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  itens jsonb not null default '[]'::jsonb,
  total numeric(10,2) not null default 0,
  endereco_entrega text not null,
  observacao text,
  cliente_nome text,
  cliente_telefone text,
  status text not null default 'recebido'
    check (status in ('recebido', 'preparando', 'saiu', 'entregue', 'cancelado')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Colunas do ecossistema entregador (originalmente em 2026-07-02-entregadores).
alter table public.pedidos_clientes
  add column if not exists entregador_id uuid references public.entregadores(id) on delete set null;
alter table public.pedidos_clientes
  add column if not exists valor_corrida numeric(10,2) not null default 0;
alter table public.pedidos_clientes
  add column if not exists codigo_confirmacao text;
alter table public.pedidos_clientes
  add column if not exists pagamento_corrida text not null default 'pendente'
    check (pagamento_corrida in ('pendente', 'pago'));

-- Taxa congelada + ponto de entrega + distancia.
alter table public.pedidos_clientes
  add column if not exists taxa_entrega numeric(10,2) not null default 0;
alter table public.pedidos_clientes
  add column if not exists entrega_latitude  double precision,
  add column if not exists entrega_longitude double precision,
  add column if not exists distancia_km numeric(10,2);

-- Pagamento online (Stripe).
alter table public.pedidos_clientes
  add column if not exists pagamento_metodo text not null default 'entrega'
    check (pagamento_metodo in ('online', 'entrega')),
  add column if not exists pagamento_status text not null default 'pendente'
    check (pagamento_status in ('pendente', 'pago')),
  add column if not exists stripe_session_id text,
  add column if not exists stripe_payment_intent text;

-- Fidelidade (resgate de pontos).
alter table public.pedidos_clientes
  add column if not exists pontos_usados integer not null default 0
    check (pontos_usados >= 0),
  add column if not exists desconto_pontos numeric(10,2) not null default 0
    check (desconto_pontos >= 0);

create index if not exists idx_pedidos_clientes_loja    on public.pedidos_clientes (loja_id, created_at desc);
create index if not exists idx_pedidos_clientes_cliente on public.pedidos_clientes (cliente_id, created_at desc);
create index if not exists idx_pedidos_clientes_status  on public.pedidos_clientes (loja_id, status);
create index if not exists idx_pedidos_entregador       on public.pedidos_clientes (entregador_id);

-- ============================================================================
-- 8. TABELA pontos_clientes - saldo de fidelidade (um registro por cliente+loja).
-- ============================================================================
create table if not exists public.pontos_clientes (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  loja_id uuid not null references public.lojas(id) on delete cascade,
  pontos integer not null default 0 check (pontos >= 0),
  updated_at timestamptz not null default now(),
  unique (cliente_id, loja_id)
);

create index if not exists idx_pontos_clientes_cliente on public.pontos_clientes (cliente_id);
create index if not exists idx_pontos_clientes_loja    on public.pontos_clientes (loja_id);

alter table public.pontos_clientes enable row level security;

do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'pontos_clientes'
  loop
    execute format('drop policy if exists %I on public.pontos_clientes', pol.policyname);
  end loop;
end $$;

grant select on public.pontos_clientes to authenticated;

create policy "pontos_cli_select_dono" on public.pontos_clientes
  for select to authenticated using (
    exists (select 1 from public.clientes c where c.id = cliente_id and c.user_id = auth.uid())
  );
create policy "pontos_loja_select_dono" on public.pontos_clientes
  for select to authenticated using (
    exists (select 1 from public.lojas l where l.id = loja_id and l.user_id = auth.uid())
  );

-- ============================================================================
-- 9. TABELA pedidos_pendentes - guarda o pedido ate o pagamento online confirmar.
--    So o service role (checkout + webhook) acessa - RLS ligada, sem policy.
-- ============================================================================
create table if not exists public.pedidos_pendentes (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  loja_id uuid not null references public.lojas(id) on delete cascade,
  itens jsonb not null,
  endereco_entrega text not null,
  entrega_latitude double precision,
  entrega_longitude double precision,
  observacao text,
  cliente_nome text,
  cliente_telefone text,
  subtotal numeric(10,2) not null default 0,
  taxa_entrega numeric(10,2) not null default 0,
  total numeric(10,2) not null default 0,
  stripe_session_id text,
  created_at timestamptz not null default now()
);

alter table public.pedidos_pendentes
  add column if not exists pontos_usados integer not null default 0,
  add column if not exists desconto_pontos numeric(10,2) not null default 0;

create index if not exists idx_pedidos_pendentes_session on public.pedidos_pendentes (stripe_session_id);

alter table public.pedidos_pendentes enable row level security;
-- Sem policies: authenticated nao acessa; so service role (checkout/webhook).

commit;

-- FIM DA PARTE 2/3 - em seguida rode a Parte 3 (secoes 10-13).
