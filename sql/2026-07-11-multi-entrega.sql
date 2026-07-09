-- ============================================================================
-- Commerly — 2026-07-11
-- Multi-entrega: o entregador leva até 2 pedidos na mesma viagem.
--
-- Os dois pedidos ganham o mesmo `lote_entrega_id` e a ordem otimizada da rota
-- (coleta e entrega). A ordem é calculada no servidor
-- (app/lib/rota.ts → /api/entregador/aceitar-junto), não no banco.
--
-- Idempotente.
-- ============================================================================

alter table public.pedidos_clientes add column if not exists lote_entrega_id uuid;

-- 1 ou 2. `smallint` porque MAX_ENTREGAS_SIMULTANEAS = 2 e não há intenção de
-- crescer: acima de 2 a rota vira um problema de roteirização de verdade.
alter table public.pedidos_clientes add column if not exists ordem_coleta smallint;
alter table public.pedidos_clientes add column if not exists ordem_entrega smallint;

-- Buscar "os outros pedidos do meu lote" é a leitura mais frequente.
create index if not exists pedidos_clientes_lote_idx
  on public.pedidos_clientes (lote_entrega_id) where lote_entrega_id is not null;

-- Um lote nunca passa de 2 pedidos. Um índice único em (lote, ordem_coleta)
-- garante isso junto com o CHECK abaixo: só há duas ordens possíveis, e cada
-- uma só pode ser usada uma vez no mesmo lote.
alter table public.pedidos_clientes drop constraint if exists pedidos_clientes_ordem_coleta_check;
alter table public.pedidos_clientes add constraint pedidos_clientes_ordem_coleta_check
  check (ordem_coleta is null or ordem_coleta in (1, 2));

alter table public.pedidos_clientes drop constraint if exists pedidos_clientes_ordem_entrega_check;
alter table public.pedidos_clientes add constraint pedidos_clientes_ordem_entrega_check
  check (ordem_entrega is null or ordem_entrega in (1, 2));

create unique index if not exists pedidos_clientes_lote_coleta_uniq
  on public.pedidos_clientes (lote_entrega_id, ordem_coleta)
  where lote_entrega_id is not null;

create unique index if not exists pedidos_clientes_lote_entrega_uniq
  on public.pedidos_clientes (lote_entrega_id, ordem_entrega)
  where lote_entrega_id is not null;

-- NOTA sobre o trigger `pedidos_clientes_guard`: no ramo de UPDATE ele força
-- `new.<coluna> := old.<coluna>` para um conjunto fixo de colunas. As três
-- colunas novas NÃO estão nessa lista, então continuam graváveis — é assim que
-- /api/entregador/aceitar-junto consegue montar o lote. Se algum dia a lista do
-- guard for regenerada, lembre de deixar estas de fora.
