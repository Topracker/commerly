-- Correção: clientes não viam comércios em /cliente/buscar.
-- Causa provável: a view lojas_publicas estava com security_invoker=true
-- (aplica o RLS de `lojas`, que não dá SELECT a clientes) e/ou sem GRANT.
-- Tornar a view "security definer" expõe apenas as colunas públicas a todos.

alter view public.lojas_publicas set (security_invoker = false);

grant select on public.lojas_publicas to anon, authenticated;

-- Verificação (deve retornar > 0 se houver lojas cadastradas):
-- select count(*) from public.lojas_publicas;

-- Se ainda voltar vazio, a view pode não expor as colunas usadas.
-- Recrie-a (ajuste os nomes de coluna conforme a tabela `lojas` se necessário):
--
-- create or replace view public.lojas_publicas
--   with (security_invoker = false) as
--   select id, nome, tipo, localizacao, telefone, instagram, horario, created_at
--   from public.lojas;
-- grant select on public.lojas_publicas to anon, authenticated;
