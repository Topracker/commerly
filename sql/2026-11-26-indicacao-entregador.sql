-- ============================================================================
-- Indicação paga entre entregadores — 2026-11-26
-- APLICADO em produção em 2026-11-26 (via MCP do Supabase).
-- ----------------------------------------------------------------------------
-- Reaproveita `indicacoes` (mesmo código/link /convite/[codigo], mesmo
-- IndicacaoClaim, mesma idempotência por indicado). Muda só a recompensa
-- quando INDICADOR e INDICADO são entregadores:
--   - nasce `pendente` (antes: R$15 em créditos na hora do cadastro);
--   - vira `recompensada` quando o indicado tem 5 corridas ENTREGUES e o
--     transfer de R$30 (Stripe Connect) para o indicador sai.
-- Indicador que não é entregador (comerciante/cliente indicando entregador)
-- continua no modelo antigo: R$15 em créditos na hora.
--
-- `bonus_*` é só do servidor (RLS ligada e sem policy em `indicacoes`).
-- Disparo: confirmar-entrega (na 5ª corrida) + retry no cron diário de repasse.
-- Idempotência: idempotency key `indicacao-<id>` na Stripe + bonus_transfer_id.
-- ============================================================================

alter table public.indicacoes add column if not exists bonus_valor numeric;
alter table public.indicacoes add column if not exists bonus_meta_corridas integer;
alter table public.indicacoes add column if not exists bonus_transfer_id text;
alter table public.indicacoes add column if not exists bonus_pago_em timestamptz;
alter table public.indicacoes add column if not exists bonus_tentativas integer not null default 0;
alter table public.indicacoes add column if not exists bonus_erro text;

create index if not exists indicacoes_bonus_pendente_idx
  on public.indicacoes (indicado_user_id) where bonus_valor is not null and bonus_pago_em is null;
