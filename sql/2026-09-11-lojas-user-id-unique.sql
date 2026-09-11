-- ============================================================================
-- UM USUÁRIO = UMA LOJA (auditoria 2026-09-11, achado A1)
-- ----------------------------------------------------------------------------
-- `lojas` não tinha nenhuma constraint UNIQUE: nada impedia duas linhas com o
-- mesmo user_id (salvar o onboarding em duas abas, ou um erro transitório no
-- useAuth mandando um comerciante existente de volta ao cadastro). Com duas
-- lojas, o `.single()` do useAuth falha, o hook manda para /onboarding, o
-- onboarding vê que existe loja e manda para /dashboard — loop infinito, conta
-- inutilizável. As rotas de API que leem a loja por user_id com `.single()`
-- (ads, b2b, copilot, stripe-connect...) quebrariam do mesmo jeito.
--
-- Índice (não constraint) para ser idempotente com `if not exists`.
-- Verificado antes de aplicar: 7 lojas, 0 user_id nulo, 0 duplicatas.
--
-- APLICADO em produção em 2026-09-11 via MCP do Supabase.
-- ============================================================================

create unique index if not exists lojas_user_id_uidx on public.lojas (user_id);

-- Conferência (deve devolver 1 linha):
-- select indexname from pg_indexes
--  where schemaname = 'public' and tablename = 'lojas' and indexname = 'lojas_user_id_uidx';
