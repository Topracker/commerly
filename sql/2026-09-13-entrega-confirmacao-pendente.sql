-- ===========================================================================
-- D6 — Entregador em rota perde a corrida por tela bloqueada
-- PARTE 1 de 2 — confirmação pendente (notificação + estado)
-- APLICADO EM PRODUÇÃO: 2026-09-13 (via MCP do Supabase)
-- ---------------------------------------------------------------------------
-- Antes disto, /api/entrega/checar-entregador liberava o pedido sozinho depois
-- de 10 min sem GPS, sem perguntar a ninguém: o entregador (que podia estar com
-- o pedido em mãos e o celular bloqueado) não era avisado, e a loja também não.
--
-- Agora a inatividade abre uma CONFIRMAÇÃO PENDENTE:
--   6 min sem GPS  -> pergunta ao entregador (+ push) e alerta a loja;
--   + 4 min sem resposta e sem GPS novo -> aí sim libera (10 min no total,
--     o mesmo pior caso de antes — sem regressão para o cliente);
--   a loja pode liberar antes disso, por botão.
--
-- A PARTE 2 (policy de entregas_localizacao exigindo que o entregador seja o
-- dono ATUAL do pedido) está em
-- sql/2026-09-13-entregas-localizacao-policy-dono-do-pedido.sql e NÃO foi
-- aplicada — espera a validação desta parte em produção.
-- ===========================================================================

-- ── 1. Tipo novo de notificação ────────────────────────────────────────────
-- A lista abaixo é o corpo VIVO do CHECK (pg_get_constraintdef, 18 tipos em
-- 2026-09-13) + 'entrega_confirmar'. DROP/ADD reescreve a lista inteira: omitir
-- um tipo faz o insert daquele tipo falhar depois, em silêncio.
alter table public.notificacoes drop constraint if exists notificacoes_tipo_check;
alter table public.notificacoes add constraint notificacoes_tipo_check
  check (tipo = any (array[
    'pedido_novo','pedido_status','parceria_aceita','corrida_oferta','cupom','post_novo',
    'flash_sale','retencao','relatorio','despacho','kit_status','medalha','missao',
    'ranking','cidade','convite','promocao','boas_vindas',
    'entrega_confirmar'
  ]));

-- ── 2. Estado da confirmação ───────────────────────────────────────────────
-- Colunas, não tabela nova: o dado é 1:1 com o pedido e efêmero, e tabela nova
-- significaria RLS nova (mais superfície para errar). ADD COLUMN IF NOT EXISTS
-- porque CREATE TABLE IF NOT EXISTS não adiciona coluna em tabela existente.
alter table public.pedidos_clientes
  add column if not exists entrega_confirmacao_pedida_em timestamptz,
  add column if not exists entrega_confirmada_em timestamptz;

comment on column public.pedidos_clientes.entrega_confirmacao_pedida_em is
  'Perguntamos ao entregador se ainda está com o pedido (GPS parado há GPS_SEM_SINAL_MS). NULL = sem pendência.';
comment on column public.pedidos_clientes.entrega_confirmada_em is
  'Última vez que o entregador respondeu "estou com o pedido". Zera a pendência e reinicia o relógio.';
