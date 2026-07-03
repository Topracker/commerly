-- Taxa de entrega (delivery).
--
-- O comerciante de um nicho de delivery define uma taxa de entrega fixa nas
-- Configurações; ela é somada ao subtotal dos produtos no pedido do cliente.
--
-- Rode este SQL no SQL Editor do Supabase (produção). Tudo é idempotente.
--
-- O que ele faz:
--   1. Adiciona `taxa_entrega` (numeric) na tabela `lojas`  — valor configurado.
--   2. Adiciona `taxa_entrega` (numeric) na tabela `pedidos_clientes` — a taxa
--      congelada no momento do pedido (o `total` do pedido já a inclui).
--   3. Recria a view pública `lojas_publicas` para expor `taxa_entrega`, para o
--      app do cliente calcular subtotal + taxa + total sem acessar `lojas`.
--   4. Recria o trigger-guarda de `pedidos_clientes` para também preservar
--      `taxa_entrega` no UPDATE (campo imutável após a criação do pedido).

-- ---------------------------------------------------------------------------
-- 1. Coluna na loja
-- ---------------------------------------------------------------------------
alter table public.lojas
  add column if not exists taxa_entrega numeric(10,2) not null default 0;

-- ---------------------------------------------------------------------------
-- 2. Coluna no pedido (congela a taxa vigente no momento do pedido)
-- ---------------------------------------------------------------------------
alter table public.pedidos_clientes
  add column if not exists taxa_entrega numeric(10,2) not null default 0;

-- ---------------------------------------------------------------------------
-- 3. View pública — recriada para incluir taxa_entrega.
--    security_invoker=false (security definer) para anon/authenticated
--    enxergarem as lojas mesmo com o RLS restritivo da tabela base.
-- ---------------------------------------------------------------------------
drop view if exists public.lojas_publicas;
create view public.lojas_publicas
  with (security_invoker = false) as
  select id, nome, tipo, localizacao, telefone, instagram, horario,
         latitude, longitude, fotos_fachada, taxa_entrega, created_at
  from public.lojas;

grant select on public.lojas_publicas to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Trigger-guarda: além dos demais campos imutáveis, preserva taxa_entrega
--    no UPDATE (o comerciante só muda o status; a taxa fica congelada).
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
    new.taxa_entrega := old.taxa_entrega;
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

-- ---------------------------------------------------------------------------
-- 5. Verificação (rode manualmente após aplicar):
--   select taxa_entrega from public.lojas_publicas limit 1;
--   select column_name from information_schema.columns
--     where table_name = 'pedidos_clientes' and column_name = 'taxa_entrega';
-- ---------------------------------------------------------------------------
