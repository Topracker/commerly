-- ============================================================================
-- A9: loja nova nasce com 3 dias de teste — e o teste deixa de ser editável
-- ----------------------------------------------------------------------------
-- Antes: `plano default 'inativo'` e `trial_expira_em default null`. Tanto
-- `plano_bloqueia()` (RLS paywall_plano) quanto `situacaoPlano()` (TS) tratam
-- trial nulo como BLOQUEADA — toda loja nova caía no /planos no primeiro
-- segundo. As lojas inativas com trial vivo hoje ganharam a data à mão.
--
-- Achado junto: `lojas_bloqueia_cobranca_cliente` congelava plano/stripe/mp
-- contra anon/authenticated, mas NÃO `trial_expira_em`; `lojas_update_own`
-- deixa o dono escrever qualquer coluna. Ou seja, um comerciante fazia
-- `PATCH /rest/v1/lojas {trial_expira_em: '2099-01-01'}` com a própria sessão
-- e tinha trial infinito. Dar trial de fábrica sem fechar isso seria dar o
-- valor padrão de um campo que o usuário controla.
--
-- O que este arquivo faz:
--   1. default da coluna = now() + 3 dias (vale para QUALQUER caminho de
--      criação: onboarding, admin, script). Default não reescreve linhas
--      existentes — as lojas de hoje ficam como estão.
--   2. trigger recriado A PARTIR DO CORPO VIVO (puxado em 2026-09-19) com
--      duas linhas a mais: INSERT força now()+3d (ignora o que o cliente
--      mandar); UPDATE mantém o valor antigo. Service role (webhook Stripe,
--      admin, scripts) continua livre — é quem legitimamente estende trial.
--
-- Bebidas Express (sem trial desde abril) fica de fora de propósito: a loja
-- é órfã (user_id sem auth.users) e vai embora no L2.
--
-- Aplicado em produção via MCP em 2026-09-19.
-- ============================================================================

alter table public.lojas
  alter column trial_expira_em set default (now() + interval '3 days');

create or replace function public.lojas_bloqueia_cobranca_cliente()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if current_user not in ('anon', 'authenticated') then return new; end if;
  if tg_op = 'INSERT' then
    new.plano := 'inativo';
    new.stripe_subscription_id := null;
    new.mp_assinatura_id := null;
    new.assinatura_ciclos := 0;
    -- Trial é de fábrica: 3 dias a partir de agora, mande o cliente o que mandar.
    new.trial_expira_em := now() + interval '3 days';
  elsif tg_op = 'UPDATE' then
    new.plano := old.plano;
    new.stripe_subscription_id := old.stripe_subscription_id;
    new.mp_assinatura_id := old.mp_assinatura_id;
    new.assinatura_ciclos := old.assinatura_ciclos;
    -- Só service role estende ou encerra o teste.
    new.trial_expira_em := old.trial_expira_em;
  end if;
  return new;
end; $function$;

-- Conferência:
--   select column_default from information_schema.columns
--    where table_name = 'lojas' and column_name = 'trial_expira_em';
--   select pg_get_functiondef('public.lojas_bloqueia_cobranca_cliente'::regproc);
