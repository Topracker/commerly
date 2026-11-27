-- =============================================================================
-- Remover o trial de 3 dias — loja nova fica bloqueada até assinar
-- =============================================================================
-- STATUS: PRONTO, AINDA NÃO APLICADO em produção (preparado em 2026-11-26;
--   falta acesso ao painel/MCP do Supabase nesta sessão para rodar e conferir
--   os md5 depois). Rode este arquivo e depois a query de conferência no fim.
--
-- DECISÃO (Matheus, 2026-11-26): a Commerly deixa de dar 3 dias grátis em
-- qualquer cadastro novo. Loja só usa o painel depois de pagar a primeira
-- mensalidade (Stripe ou Mercado Pago).
--
-- O QUE MUDA: só o trigger que roda no INSERT de `lojas`
-- (`lojas_bloqueia_cobranca_cliente`, de sql/2026-10-25-fundador-dois-meses.sql)
-- — ele parava de dar trial só pra quem estava em quarentena de exclusão de
-- conta (`documento_em_quarentena`); agora ninguém ganha trial, então a
-- distinção não faz mais sentido e o `if/else` vira uma atribuição só.
--
-- O QUE NÃO MUDA (e por quê não precisa mudar):
--   * `public.plano_bloqueia()` (sql/2026-07-22-paywall-rls.sql) já trata
--     `trial_expira_em is null` como bloqueado — zero mudança nela.
--   * `situacaoPlano()` (app/lib/plano.ts) já trata ausência de trial do
--     mesmo jeito (`diasAte(null) === 0` -> `emTeste = false`).
--   * `/onboarding` continua liberado sem plano (ROTAS_LIVRES_SEM_PLANO) —
--     o comerciante consegue criar a loja e só esbarra no paywall ao tentar
--     usar o painel de verdade, que é a tela /planos.
--
-- Loja de uma conta em quarentena (documento_em_quarentena) continua recebendo
-- `trial_expira_em = now()` (já vencido) — mesmo efeito prático de antes.
--
-- ATENÇÃO: isto não mexe em loja já existente. Quem já tinha trial rodando
-- continua com o `trial_expira_em` que já tinha (este trigger só dispara em
-- INSERT). Se a intenção for cortar o trial de quem está em teste agora
-- também, isso é uma segunda decisão (um UPDATE em massa) — não incluído
-- aqui de propósito, perguntar antes.
-- =============================================================================

begin;

do $$
begin
  if md5(pg_get_functiondef('public.lojas_bloqueia_cobranca_cliente'::regproc)) <> '34d73a3d5ae1da1fade1a91659a353a1' then
    raise exception 'lojas_bloqueia_cobranca_cliente mudou desde a leitura (sql/2026-10-25-fundador-dois-meses.sql) — puxe o corpo vivo de novo antes de aplicar';
  end if;
end $$;

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
    new.fundador_promo_em := null;
    -- Sem trial: loja nasce já sem período de teste. `documento_em_quarentena`
    -- não precisa mais de ramo próprio — os dois casos chegam no mesmo valor.
    new.trial_expira_em := now();
  elsif tg_op = 'UPDATE' then
    new.plano := old.plano;
    new.stripe_subscription_id := old.stripe_subscription_id;
    new.mp_assinatura_id := old.mp_assinatura_id;
    new.assinatura_ciclos := old.assinatura_ciclos;
    -- Só service role estende ou encerra o teste (não existe mais pra loja
    -- nova, mas uma loja antiga que ainda tenha trial futuro mantém o dela).
    new.trial_expira_em := old.trial_expira_em;
    new.fundador := old.fundador;
    new.fundador_promo_em := old.fundador_promo_em;
  end if;
  return new;
end; $function$;

commit;

-- ---------------------------------------------------------------------------
-- Conferência pós-aplicação (rodar e anotar aqui o resultado):
--   select md5(pg_get_functiondef('public.lojas_bloqueia_cobranca_cliente'::regproc));
--     esperado: (gerar de novo depois de aplicar — a assinatura mudou)
--   -- cadastro novo de teste: confirmar que a loja nasce com
--   -- trial_expira_em <= now() e plano='inativo', e que /dashboard redireciona
--   -- pra /planos na hora (sem nenhum dia de acesso).
-- ---------------------------------------------------------------------------
