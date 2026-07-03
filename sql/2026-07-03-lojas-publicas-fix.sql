-- Correção da visibilidade pública das lojas (marketplace do cliente).
--
-- SINTOMA: /cliente/buscar (e o mapa, /loja/[id], ranking) não mostram NENHUMA
-- loja. Testado: como anon E como authenticated, `select * from lojas_publicas`
-- retorna 0 linhas; como service_role retorna todas.
--
-- CAUSA: a RLS de `lojas` é owner-only (cada comerciante só vê a própria). A
-- leitura pública deve vir da view `lojas_publicas` como SECURITY DEFINER
-- (security_invoker = false) — assim ela executa como dona (postgres) e enxerga
-- todas as lojas. Em produção a view estava aplicando a RLS (invoker), então
-- anon/authenticated não viam nada. Este script recria a view no modo correto.
--
-- Rode no SQL Editor do Supabase (produção). Idempotente.

drop view if exists public.lojas_publicas;
create view public.lojas_publicas
  with (security_invoker = false) as
  select id, nome, tipo, localizacao, telefone, instagram, horario,
         latitude, longitude, fotos_fachada, taxa_entrega, created_at
  from public.lojas;

grant select on public.lojas_publicas to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Verificação (rode manualmente após aplicar):
--   -- Deve retornar > 0 como anon/authenticated:
--   select count(*) from public.lojas_publicas;
--   -- Confirma o modo da view (security_invoker deve ser 'false' ou ausente):
--   select c.relname, c.reloptions
--     from pg_class c join pg_namespace n on n.oid = c.relnamespace
--    where n.nspname = 'public' and c.relname = 'lojas_publicas';
-- ---------------------------------------------------------------------------
