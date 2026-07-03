-- Pagamento do pedido pelo cliente (Stripe) — online ou na entrega.
--
-- FLUXO ONLINE (cartão):
--   1. Cliente escolhe "pagar online" no PedidoModal.
--   2. /api/cliente/pedido-checkout grava um pedido PENDENTE (pedidos_pendentes)
--      e cria um Stripe Checkout (mode=payment) como DESTINATION CHARGE:
--        transfer_data.destination = conta Connect da loja
--        transfer_data.amount      = subtotal (produtos)  -> vai pro comerciante
--        o restante (taxa de entrega) fica na plataforma  -> paga o entregador
--        depois, no confirmar-entrega (transfer p/ a conta do entregador).
--   3. Pago -> webhook cria o pedido de verdade em pedidos_clientes
--      (pagamento_metodo='online', pagamento_status='pago') e apaga o pendente.
--      => "o pedido só é criado após o pagamento confirmado".
--
-- FLUXO NA ENTREGA (dinheiro/Pix): o app insere direto em pedidos_clientes
--   com pagamento_metodo='entrega', pagamento_status='pendente' (paga na mão).
--
-- Pré-requisitos externos (fora do código):
--   - Conta Stripe da plataforma com BRL habilitado (senão o Checkout falha).
--   - Cada comerciante conecta sua conta via /api/loja/stripe-connect.
--
-- Rode no SQL Editor do Supabase (produção). Tudo é idempotente.

-- ===========================================================================
-- 1. LOJA: conta Stripe Connect para RECEBER o pagamento do pedido.
-- ===========================================================================
alter table public.lojas
  add column if not exists stripe_account_id text,
  add column if not exists stripe_onboarded boolean not null default false;

-- ===========================================================================
-- 2. PEDIDO: método e status de pagamento + referências do Stripe.
-- ===========================================================================
alter table public.pedidos_clientes
  add column if not exists pagamento_metodo text not null default 'entrega'
    check (pagamento_metodo in ('online', 'entrega')),
  add column if not exists pagamento_status text not null default 'pendente'
    check (pagamento_status in ('pendente', 'pago')),
  add column if not exists stripe_session_id text,
  add column if not exists stripe_payment_intent text;

-- ===========================================================================
-- 3. GUARD reescrito: mesma lógica de antes (recalcula subtotal/distância/taxa/
--    corrida/total no INSERT; conteúdo imutável no UPDATE) + agora também trava
--    os campos de pagamento no UPDATE (definidos na criação, nunca alterados
--    pelo comerciante/entregador). SECURITY DEFINER para ler coords da loja.
-- ===========================================================================
create or replace function public.pedidos_clientes_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  loja_lat double precision;
  loja_lng double precision;
  dist numeric;
  subtotal numeric;
begin
  if tg_op = 'INSERT' then
    new.status := 'recebido';
    new.entregador_id := null;
    new.codigo_confirmacao := null;
    new.pagamento_corrida := 'pendente';
    new.created_at := now();
    new.updated_at := now();

    select coalesce(sum(
             (e->>'preco')::numeric * (e->>'quantidade')::numeric
           ), 0)
      into subtotal
      from jsonb_array_elements(coalesce(new.itens, '[]'::jsonb)) e;

    select latitude, longitude into loja_lat, loja_lng
      from public.lojas where id = new.loja_id;

    dist := public.haversine_km(loja_lat, loja_lng, new.entrega_latitude, new.entrega_longitude);
    new.distancia_km  := dist;
    new.taxa_entrega  := public.calcular_taxa_entrega(dist);
    new.valor_corrida := new.taxa_entrega;
    new.total         := subtotal + new.taxa_entrega;
    -- pagamento_metodo / pagamento_status / stripe_* passam como enviados
    -- (webhook: online/pago; app na entrega: entrega/pendente).

  elsif tg_op = 'UPDATE' then
    new.loja_id := old.loja_id;
    new.cliente_id := old.cliente_id;
    new.itens := old.itens;
    new.total := old.total;
    new.taxa_entrega := old.taxa_entrega;
    new.valor_corrida := old.valor_corrida;
    new.distancia_km := old.distancia_km;
    new.entrega_latitude := old.entrega_latitude;
    new.entrega_longitude := old.entrega_longitude;
    new.endereco_entrega := old.endereco_entrega;
    new.observacao := old.observacao;
    new.cliente_nome := old.cliente_nome;
    new.cliente_telefone := old.cliente_telefone;
    new.created_at := old.created_at;
    new.updated_at := now();
    -- Pagamento é imutável após a criação.
    new.pagamento_metodo := old.pagamento_metodo;
    new.pagamento_status := old.pagamento_status;
    new.stripe_session_id := old.stripe_session_id;
    new.stripe_payment_intent := old.stripe_payment_intent;
    -- Código de confirmação: gera ao sair para entrega; depois imutável.
    if old.codigo_confirmacao is not null and old.codigo_confirmacao <> '' then
      new.codigo_confirmacao := old.codigo_confirmacao;
    elsif new.status = 'saiu' then
      new.codigo_confirmacao := lpad((floor(random() * 10000))::int::text, 4, '0');
    else
      new.codigo_confirmacao := old.codigo_confirmacao;
    end if;
    -- status, entregador_id, pagamento_corrida passam livres.
  end if;
  return new;
end;
$$;

drop trigger if exists trg_pedidos_clientes_guard on public.pedidos_clientes;
create trigger trg_pedidos_clientes_guard
  before insert or update on public.pedidos_clientes
  for each row execute function public.pedidos_clientes_guard();

-- ===========================================================================
-- 4. PEDIDOS PENDENTES: guarda o pedido até o pagamento online confirmar.
--    Só o service role (checkout + webhook) mexe aqui — RLS ligada sem policy.
-- ===========================================================================
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

create index if not exists idx_pedidos_pendentes_session on public.pedidos_pendentes (stripe_session_id);

alter table public.pedidos_pendentes enable row level security;
-- Sem policies: authenticated não acessa; o service role (checkout/webhook) sim.

-- ===========================================================================
-- 5. VIEW PÚBLICA recriada: expõe se a loja aceita pagamento online
--    (tem Connect concluído) para o app do cliente decidir mostrar a opção.
--    security_invoker=false (definer) para anon/authenticated enxergarem.
-- ===========================================================================
drop view if exists public.lojas_publicas;
create view public.lojas_publicas
  with (security_invoker = false) as
  select id, nome, tipo, localizacao, telefone, instagram, horario,
         latitude, longitude, fotos_fachada, taxa_entrega, created_at,
         (stripe_onboarded and stripe_account_id is not null) as aceita_pagamento_online
  from public.lojas;

grant select on public.lojas_publicas to anon, authenticated;

-- ===========================================================================
-- 6. Verificação (rode manualmente após aplicar):
--   select column_name from information_schema.columns
--     where table_name='pedidos_clientes'
--       and column_name in ('pagamento_metodo','pagamento_status',
--         'stripe_session_id','stripe_payment_intent');
--   select column_name from information_schema.columns
--     where table_name='lojas' and column_name in ('stripe_account_id','stripe_onboarded');
--   select aceita_pagamento_online from public.lojas_publicas limit 1;
-- ===========================================================================
