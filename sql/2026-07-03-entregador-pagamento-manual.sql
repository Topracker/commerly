-- Fallback de pagamento manual do entregador.
--
-- Quando a criação da conta Stripe Connect falha (ex.: plataforma Connect não
-- configurada), o entregador não deve ficar travado. Este flag sinaliza que o
-- comerciante paga a corrida manualmente (fora do Stripe) por enquanto; o
-- dashboard mostra a mensagem de suporte e a rota /api/entregador/stripe-connect
-- liga/desliga o flag conforme o onboarding.
--
-- Rode no SQL Editor do Supabase (produção). Idempotente. Nullable-safe:
-- default false não quebra linhas existentes.

alter table public.entregadores
  add column if not exists pagamento_manual boolean not null default false;

-- Verificação (rode manualmente após aplicar):
--   select column_name from information_schema.columns
--     where table_name = 'entregadores' and column_name = 'pagamento_manual';
