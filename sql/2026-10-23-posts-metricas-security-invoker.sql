-- ============================================================================
-- posts_metricas volta a security_invoker = true
-- ----------------------------------------------------------------------------
-- STATUS: NÃO APLICADO em produção (aguardando aprovação).
--
-- O problema: sql/2026-07-14-feed-social.sql criou a view com
-- `security_invoker = true`, mas sql/2026-08-02-feed-compartilhamentos.sql a
-- recriou com `create or replace view` SEM a cláusula `with (...)`. A view
-- passou a rodar como o dono (postgres), por cima da RLS de `post_eventos`.
--
-- Conferido em 2026-10-23 via REST com a chave anon (sem login):
--   posts           → */0   (RLS ok, só authenticated)
--   post_eventos    → */0   (RLS ok, só dono do post / cliente)
--   posts_metricas  → 0-1/2 com loja_id, visualizacoes e cliques_pedir
-- Ou seja: qualquer um, sem conta, lê a métrica de conversão de todos os
-- posts de todas as lojas. Sem dado pessoal, mas é dado de negócio que a
-- própria RLS de post_eventos esconde.
--
-- Depois da correção (security_invoker):
--   - anon: 0 linhas (posts só libera authenticated);
--   - authenticated: likes/comentarios iguais aos de hoje (essas tabelas já
--     são legíveis por authenticated); visualizacoes/cliques_pedir só contam
--     para o dono do post — exatamente o que /posts usa (filtra loja_id).
--
-- Não mexe em função nem trigger (sem guard de md5). Idempotente.
--
-- ARMADILHA para o futuro: toda recriação desta view precisa repetir
-- `with (security_invoker = true)` — `create or replace view` sem a cláusula
-- derruba a opção em silêncio.
-- ============================================================================

begin;

alter view public.posts_metricas set (security_invoker = true);

-- O anon nunca precisou desta view (só /posts, do comerciante logado, lê).
revoke select on public.posts_metricas from anon;

commit;

-- ---------------------------------------------------------------------------
-- Conferência (deve voltar security_invoker=true e anon=false):
-- select c.relname, c.reloptions, has_table_privilege('anon', c.oid, 'SELECT') anon
--   from pg_class c where c.oid = 'public.posts_metricas'::regclass;
--
-- E via REST (o que vale — ver regra 12 do CLAUDE.md):
--   anon        GET /rest/v1/posts_metricas → 401/42501 ou */0
--   comerciante GET /rest/v1/posts_metricas?loja_id=eq.<sua loja> → métricas iguais às de hoje
--
-- Rollback:
-- alter view public.posts_metricas reset (security_invoker);
-- grant select on public.posts_metricas to anon;
-- ---------------------------------------------------------------------------
