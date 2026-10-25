-- Chaves globais de módulo: cliente / entregador / fornecedor (passo 1 de 7).
--
-- Leitura das três chaves para quem NÃO tem service role (proxy.ts com a chave
-- anon, e o próprio banco nos triggers de defesa do passo 6). A tabela
-- `feature_flags` continua com RLS ligada e zero policy: ninguém lê a tabela,
-- só esta função, e só estas três chaves.
--
-- Escopo GLOBAL de propósito: cliente/entregador/fornecedor não têm
-- `cidade_slug` (só a loja tem), então um override por cidade não teria em quem
-- valer. Linha de cidade para estas flags é IGNORADA aqui e em
-- app/lib/featureFlags.ts (`getFlags`) — mesma regra nos dois lados.
--
-- Sem linha no banco = LIGADO (mesmo padrão de getFlags). Este arquivo NÃO
-- insere linha nenhuma: nada muda de comportamento até o admin virar a chave.
-- Flag fora das três devolve NULL — `delivery` & cia. têm escopo por cidade e
-- não podem ser respondidas por uma função que só olha o global.
--
-- STATUS: APLICADO em produção em 2026-10-25 (via MCP). Conferido: SQL e REST
-- anon devolvem true/true/true/null; md5 da função e7dd0d06…; 0 linhas
-- inseridas; feature_flags segue fechada ao anon ([]); guard 228429ef… intacto.

create or replace function public.modulo_ativo(p_flag text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select case
    when p_flag in ('cliente', 'entregador', 'fornecedor') then
      coalesce((select ativo from public.feature_flags
                 where cidade_slug = '__global__' and flag = p_flag), true)
  end
$$;

comment on function public.modulo_ativo(text) is
  'Chave global de módulo (cliente/entregador/fornecedor). Sem linha = ligado. Outras flags = null.';

revoke all on function public.modulo_ativo(text) from public;
grant execute on function public.modulo_ativo(text) to anon, authenticated, service_role;

-- Conferência (esperado: true, true, true, null):
-- select public.modulo_ativo('cliente'), public.modulo_ativo('entregador'),
--        public.modulo_ativo('fornecedor'), public.modulo_ativo('delivery');
--
-- REVERTER:
-- drop function if exists public.modulo_ativo(text);
