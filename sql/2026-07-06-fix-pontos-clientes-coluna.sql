-- Hotfix (2026-07-06): coluna public.pontos_clientes.pontos ausente em producao.
--
-- Sintoma: qualquer INSERT em public.pedidos_clientes falha com
--   "column \"pontos\" of relation \"pontos_clientes\" does not exist"
-- ou seja: o cliente NAO consegue fazer nenhum pedido de delivery (o trigger
-- AFTER INSERT `acumular_pontos_pedido` credita os pontos e quebra).
--
-- Causa: a tabela `pontos_clientes` ja existia em producao numa versao ANTIGA
-- (colunas `saldo` e `total_acumulado`). Como a migracao de fidelidade
-- (2026-07-04-fidelidade.sql) cria a tabela com `create table if not exists`,
-- o comando virou no-op e a coluna nova `pontos` nunca foi adicionada.
--
-- A constraint unique(cliente_id, loja_id) ja existe (o ON CONFLICT do trigger
-- funciona), entao basta acrescentar a coluna esperada pelo codigo e triggers.
-- As colunas legadas `saldo`/`total_acumulado` ficam (nao sao usadas por
-- nenhum codigo; a tabela esta vazia). Idempotente.

alter table public.pontos_clientes
  add column if not exists pontos integer not null default 0
    check (pontos >= 0);

-- Verificacao (rode manualmente apos aplicar):
--   select column_name from information_schema.columns
--     where table_schema='public' and table_name='pontos_clientes'
--     order by ordinal_position;   -- deve conter 'pontos'
