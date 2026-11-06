-- 2026-11-06 — Vendas da maquininha física no faturamento.
--
-- ESTADO: APLICADO em produção em 2026-11-06, antes do deploy do código.
--
-- As vendas entram em `vendas` (não em tabela nova) para somar sozinhas no
-- dashboard, no financeiro, na meta e no Score. Nenhuma view depende de `vendas`
-- e a tabela não tem trigger (conferido em 2026-11-06).
--
-- `valor_total` continua sendo o BRUTO. `lucro` fica 0, como nas outras
-- integrações: o extrato não diz o custo do que foi vendido.
--
-- RLS: as policies atuais de `vendas` já cobrem as colunas novas e continuam
-- valendo sem alteração:
--   "usuarios podem gerenciar vendas" — só o dono da loja (auth.uid());
--   "paywall_plano" (RESTRICTIVE)     — loja vencida não lê nem grava.
-- A importação grava com a sessão do lojista, nunca com service role.

alter table public.vendas
  add column if not exists adquirente    text,
  add column if not exists id_externo    text,
  add column if not exists taxa          numeric(12,2),
  add column if not exists valor_liquido numeric(12,2),
  add column if not exists bandeira      text;

-- Deduplicação: a mesma transação não entra duas vezes na mesma loja.
-- UNIQUE comum, não índice parcial: o ON CONFLICT do PostgREST não casa com
-- índice parcial, e NULL não colide, então as vendas antigas não são afetadas.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.vendas'::regclass
      and conname = 'vendas_loja_adquirente_id_externo_key'
  ) then
    alter table public.vendas
      add constraint vendas_loja_adquirente_id_externo_key
      unique (loja_id, adquirente, id_externo);
  end if;
end $$;

-- Sustenta o card "sem vendas de maquininha nos últimos 7 dias" do dashboard.
create index if not exists vendas_loja_origem_created_idx
  on public.vendas (loja_id, origem, created_at desc);

-- Conferência depois de aplicar (migrações parciais já aconteceram):
--   select column_name from information_schema.columns
--    where table_schema = 'public' and table_name = 'vendas'
--      and column_name in ('adquirente','id_externo','taxa','valor_liquido','bandeira');
--   -- esperado: 5 linhas
--   select conname from pg_constraint
--    where conname = 'vendas_loja_adquirente_id_externo_key';
--   -- esperado: 1 linha
--   select polname from pg_policy where polrelid = 'public.vendas'::regclass;
--   -- esperado: paywall_plano, usuarios podem gerenciar vendas
