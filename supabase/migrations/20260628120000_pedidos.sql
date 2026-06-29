-- Pedidos do comerciante (loja) para o fornecedor.
-- Itens são guardados como JSONB para evitar uma tabela de itens separada:
--   [{ "produto_id": uuid, "nome": text, "preco": number, "quantidade": int }]

create table if not exists public.pedidos (
  id            uuid primary key default gen_random_uuid(),
  loja_id       uuid not null references public.lojas(id) on delete cascade,
  fornecedor_id uuid not null references public.fornecedores(id) on delete cascade,
  itens         jsonb not null default '[]'::jsonb,
  total         numeric(12,2) not null default 0,
  observacao    text,
  status        text not null default 'pendente'
                  check (status in ('pendente', 'aceito', 'recusado', 'entregue')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists pedidos_fornecedor_id_idx on public.pedidos (fornecedor_id, created_at desc);
create index if not exists pedidos_loja_id_idx       on public.pedidos (loja_id, created_at desc);

alter table public.pedidos enable row level security;

-- Comerciante cria pedidos apenas em nome da própria loja.
drop policy if exists "loja insere pedido" on public.pedidos;
create policy "loja insere pedido" on public.pedidos
  for insert to authenticated
  with check (loja_id in (select id from public.lojas where user_id = auth.uid()));

-- Comerciante vê os pedidos que fez.
drop policy if exists "loja vê seus pedidos" on public.pedidos;
create policy "loja vê seus pedidos" on public.pedidos
  for select to authenticated
  using (loja_id in (select id from public.lojas where user_id = auth.uid()));

-- Fornecedor vê os pedidos recebidos.
drop policy if exists "fornecedor vê pedidos recebidos" on public.pedidos;
create policy "fornecedor vê pedidos recebidos" on public.pedidos
  for select to authenticated
  using (fornecedor_id in (select id from public.fornecedores where user_id = auth.uid()));

-- Fornecedor atualiza o status dos pedidos que recebeu (sem poder reatribuir
-- o pedido a outra loja/fornecedor, garantido pelo with check).
drop policy if exists "fornecedor atualiza status" on public.pedidos;
create policy "fornecedor atualiza status" on public.pedidos
  for update to authenticated
  using (fornecedor_id in (select id from public.fornecedores where user_id = auth.uid()))
  with check (fornecedor_id in (select id from public.fornecedores where user_id = auth.uid()));
