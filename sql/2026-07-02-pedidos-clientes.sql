-- Sistema de pedidos do cliente para o comerciante (delivery).
--
-- Cliente monta um pedido (itens + endereço de entrega) numa loja de delivery
-- e o comerciante acompanha/atualiza o status:
--   recebido → preparando → saiu → entregue   (+ cancelado)
--
-- Rode este SQL no SQL Editor do Supabase (produção).
-- Tudo é idempotente — pode rodar mais de uma vez sem problema.
--
-- MODELO DE ACESSO (dois papéis, ambos `authenticated`):
--   • Cliente (dono de clientes.user_id): CRIA e VÊ os próprios pedidos.
--   • Comerciante (dono de lojas.user_id): VÊ e ATUALIZA o status dos pedidos
--     da sua loja — só o campo `status`, nunca itens/total/endereço.
--   A separação é feita pelas POLICIES (owner-check), pois o Postgres não
--   distingue os dois papéis por `current_user` (os dois são `authenticated`).
--   O TRIGGER trava os campos imutáveis e força `status='recebido'` na criação
--   (impede um cliente de inserir um pedido já "entregue" pelo console).

-- ---------------------------------------------------------------------------
-- 1. Tabela
-- ---------------------------------------------------------------------------
create table if not exists public.pedidos_clientes (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  -- itens: [{ produto_id, nome, preco, quantidade }]
  itens jsonb not null default '[]'::jsonb,
  total numeric(10,2) not null default 0,
  endereco_entrega text not null,
  observacao text,
  -- Contato do cliente denormalizado: o comerciante não lê a tabela `clientes`
  -- (RLS), então guardamos o necessário pra ele entrar em contato/entregar.
  cliente_nome text,
  cliente_telefone text,
  status text not null default 'recebido'
    check (status in ('recebido', 'preparando', 'saiu', 'entregue', 'cancelado')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_pedidos_clientes_loja    on public.pedidos_clientes (loja_id, created_at desc);
create index if not exists idx_pedidos_clientes_cliente on public.pedidos_clientes (cliente_id, created_at desc);
create index if not exists idx_pedidos_clientes_status  on public.pedidos_clientes (loja_id, status);

-- ---------------------------------------------------------------------------
-- 2. TRIGGER: força status inicial, mantém updated_at e trava campos imutáveis.
--
--    INSERT: status sempre começa 'recebido' (o cliente não escolhe o status).
--    UPDATE: só `status` (e updated_at) muda — itens/total/endereço/ids são
--            preservados do valor antigo, então nem o comerciante nem o cliente
--            conseguem reescrever o conteúdo do pedido depois de criado.
-- ---------------------------------------------------------------------------
create or replace function public.pedidos_clientes_guard()
returns trigger
language plpgsql
security invoker
as $$
begin
  if tg_op = 'INSERT' then
    new.status := 'recebido';
    new.created_at := now();
    new.updated_at := now();
  elsif tg_op = 'UPDATE' then
    new.loja_id := old.loja_id;
    new.cliente_id := old.cliente_id;
    new.itens := old.itens;
    new.total := old.total;
    new.endereco_entrega := old.endereco_entrega;
    new.observacao := old.observacao;
    new.cliente_nome := old.cliente_nome;
    new.cliente_telefone := old.cliente_telefone;
    new.created_at := old.created_at;
    new.updated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_pedidos_clientes_guard on public.pedidos_clientes;
create trigger trg_pedidos_clientes_guard
  before insert or update on public.pedidos_clientes
  for each row
  execute function public.pedidos_clientes_guard();

-- ---------------------------------------------------------------------------
-- 3. RLS
-- ---------------------------------------------------------------------------
alter table public.pedidos_clientes enable row level security;

-- Remove policies antigas pra este arquivo ser a definição autoritativa.
do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'pedidos_clientes'
  loop
    execute format('drop policy if exists %I on public.pedidos_clientes', pol.policyname);
  end loop;
end $$;

grant select, insert, update, delete on public.pedidos_clientes to authenticated;

-- Cliente cria o próprio pedido.
create policy "pedidos_cli_insert_dono" on public.pedidos_clientes
  for insert to authenticated
  with check (
    exists (select 1 from public.clientes c where c.id = cliente_id and c.user_id = auth.uid())
  );

-- Cliente vê os próprios pedidos.
create policy "pedidos_cli_select_dono" on public.pedidos_clientes
  for select to authenticated
  using (
    exists (select 1 from public.clientes c where c.id = cliente_id and c.user_id = auth.uid())
  );

-- Comerciante vê os pedidos da própria loja.
create policy "pedidos_loja_select_dono" on public.pedidos_clientes
  for select to authenticated
  using (
    exists (select 1 from public.lojas l where l.id = loja_id and l.user_id = auth.uid())
  );

-- Comerciante atualiza (o trigger garante que só o status muda de fato).
create policy "pedidos_loja_update_dono" on public.pedidos_clientes
  for update to authenticated
  using (
    exists (select 1 from public.lojas l where l.id = loja_id and l.user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.lojas l where l.id = loja_id and l.user_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- 4. Verificação (rode manualmente após aplicar):
--   select policyname, cmd from pg_policies
--     where schemaname='public' and tablename='pedidos_clientes' order by policyname;
-- ---------------------------------------------------------------------------
