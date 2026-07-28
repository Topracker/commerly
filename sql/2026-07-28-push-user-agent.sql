-- ===========================================================================
-- PUSH — coluna `user_agent` que faltava em produção.
-- ---------------------------------------------------------------------------
-- DEFEITO CORRIGIDO (auditoria 2026-07-27):
--   `push_subscriptions` estava com ZERO linhas em produção mesmo com as
--   quatro variáveis VAPID configuradas na Vercel e o service worker ativo.
--
--   Causa: `sql/2026-07-04-push-subscriptions.sql` declara `user_agent text`
--   dentro de um `create table IF NOT EXISTS`. A tabela já existia de uma
--   versão anterior SEM essa coluna, então o `if not exists` pulou o bloco
--   inteiro e a coluna nunca chegou ao banco.
--
--   `/api/push/subscribe` manda `user_agent` no upsert -> o PostgREST recusa
--   (PGRST204, "Could not find the 'user_agent' column ... in the schema
--   cache") -> a rota devolve 500 -> e o cliente (`PushManager.tsx`) engolia o
--   erro num `.catch(() => {})`. Resultado: o usuário concedia a permissão, o
--   navegador criava a subscription de verdade, e ela era descartada sem que
--   ninguém percebesse. Nenhum push nativo jamais foi entregue.
--
--   Conferido em produção (2026-07-27) com uma subscription real do FCM:
--   POST /api/push/subscribe -> 500 {"error":"Não foi possível salvar a inscrição."}
--
-- A rota também foi endurecida no mesmo commit: agora loga o erro do Postgres
-- e retenta sem as colunas opcionais, para que uma divergência de schema volte
-- a degradar o diagnóstico — nunca o recurso.
--
-- Rode no SQL Editor do Supabase (produção). Idempotente.
-- ===========================================================================

alter table public.push_subscriptions
  add column if not exists user_agent text;   -- só para diagnóstico

comment on column public.push_subscriptions.user_agent is
  'User-Agent do dispositivo inscrito. Diagnóstico apenas — nunca usado para envio.';

-- ===========================================================================
-- Verificação:
--   -- Deve listar a coluna:
--   select column_name from information_schema.columns
--    where table_schema='public' and table_name='push_subscriptions';
--
--   -- Depois de conceder a permissão no app, deve aparecer 1 linha por
--   -- dispositivo:
--   select user_id, left(endpoint, 40) as endpoint, created_at
--     from public.push_subscriptions order by created_at desc limit 10;
-- ===========================================================================
