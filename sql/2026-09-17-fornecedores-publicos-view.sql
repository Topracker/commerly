-- ============================================================================
-- B2B SEM VAZAR ESTOQUE DO FORNECEDOR NEM CNPJ/STRIPE (achado L1-bis) — FASE 1
-- ----------------------------------------------------------------------------
-- Mesmo padrão do L1 (`produtos`), agora nas tabelas de fornecedor:
--
--   fp_select_all           PERMISSIVE  SELECT  {authenticated}  USING (true)
--   fornecedor_select_all   PERMISSIVE  SELECT  {authenticated}  USING (true)
--
-- Somadas por OR às policies de dono, elas abrem tudo para qualquer sessão
-- autenticada. Diferente de `produtos`, aqui NÃO existe nenhuma policy
-- RESTRICTIVE (nem paywall): é a tabela mais aberta do banco.
--
-- Confirmado em produção com JWT de cliente@teste.com (conta que não tem nada
-- a ver com B2B): 10/10 produtos com preço e ESTOQUE, e o cadastro do
-- fornecedor com CNPJ, telefone, user_id e stripe_account_id.
--
-- O que de fato vaza (o `preco` NÃO é segredo — é a oferta do catálogo, e o
-- comerciante precisa dela para comprar; não existe coluna de custo aqui):
--   1. `fornecedor_produtos.estoque` — inventário exato, visível a fornecedor
--      concorrente. É o análogo do `quantidade` do L1.
--   2. `fornecedores.cnpj` / `stripe_account_id` — hoje o stripe está null só
--      porque ninguém fez onboarding; enche sozinho no primeiro que conectar.
--   3. O catálogo inteiro para quem não é comerciante (clientes, entregadores).
--
-- ----------------------------------------------------------------------------
-- FASE 1 (este arquivo): só CRIA as views e troca os leitores no app.
-- As policies antigas continuam de pé de propósito — tabela e view funcionam
-- as duas ao mesmo tempo, então não existe janela de tela quebrada. Foi
-- exatamente o que faltou no L1, que deixou a vitrine fora do ar por 13 min
-- entre o SQL e o deploy.
--
-- FASE 2 (arquivo separado, ação aprovada à parte): derruba
-- `fp_select_all` e `fornecedor_select_all`.
-- ----------------------------------------------------------------------------
-- APLICADO em produção em 2026-09-17 via MCP do Supabase.
-- ============================================================================

-- 1. Catálogo B2B --------------------------------------------------------------
-- security_invoker = off (igual a `lojas_publicas`/`produtos_publicos`): a view
-- é dona de postgres e atravessa a RLS de propósito. É o que vai permitir
-- derrubar a policy permissiva na Fase 2 sem esvaziar as telas.
--
-- `fornecedor_nome` vem por JOIN, não por embed do PostgREST: a tela de
-- comparação usava `fornecedores(nome)`, e embed a partir de view depende de o
-- PostgREST inferir a relação — o tipo de coisa que falha em silêncio.
drop view if exists public.fornecedor_produtos_publicos;

create view public.fornecedor_produtos_publicos
with (security_invoker = off) as
select
  fp.id,
  fp.fornecedor_id,
  f.nome as fornecedor_nome,
  fp.nome,
  fp.descricao,
  fp.preco,
  fp.unidade,
  fp.minimo_pedido,
  fp.ativo,
  -- Não aparece em tela nenhuma, mas /fornecedor/[id] ordena por ele.
  fp.created_at,
  -- NUNCA o número real: o comerciante precisa saber se dá para comprar, não
  -- quanto o fornecedor tem em galpão. Se um dia a quantidade exata fizer falta
  -- para o comprador, o caminho é uma RPC estoque_suficiente(produto_id, qtd) —
  -- não reabrir a coluna.
  fp.estoque > 0 as em_estoque
from public.fornecedor_produtos fp
join public.fornecedores f on f.id = fp.fornecedor_id;

grant select on public.fornecedor_produtos_publicos to anon, authenticated;

-- 2. Cadastro do fornecedor ----------------------------------------------------
-- Fora daqui: `cnpj`, `stripe_account_id`, `stripe_onboarded`.
-- `user_id` FICA: /fornecedor/[id] usa para não deixar o fornecedor avaliar o
-- próprio perfil nem registrar visualização de si mesmo. Tirar quebraria essa
-- proteção em silêncio, e é um uuid opaco, não uma credencial.
-- `created_at` FICA: /fornecedores ordena por ele (não aparece na tela).
drop view if exists public.fornecedores_publicos;

create view public.fornecedores_publicos
with (security_invoker = off) as
select
  id,
  user_id,
  nome,
  categoria,
  localizacao,
  telefone,
  instagram,
  descricao,
  latitude,
  longitude,
  created_at
from public.fornecedores;

grant select on public.fornecedores_publicos to anon, authenticated;

-- ============================================================================
-- Conferência (rodar depois de aplicar)
-- ----------------------------------------------------------------------------
-- As policies antigas AINDA DEVEM ESTAR LÁ nesta fase (fp_select_all e
-- fornecedor_select_all): a Fase 1 não derruba nada.
--   select tablename, policyname, permissive, cmd, qual from pg_policies
--    where schemaname = 'public' and tablename in ('fornecedor_produtos','fornecedores');
--
-- Colunas (não pode aparecer estoque, cnpj, stripe_*):
--   select table_name, string_agg(column_name, ', ' order by ordinal_position)
--     from information_schema.columns
--    where table_schema = 'public'
--      and table_name in ('fornecedor_produtos_publicos','fornecedores_publicos')
--    group by table_name;
--
-- em_estoque tem que bater com estoque > 0 em 100% das linhas:
--   select count(*) from public.fornecedor_produtos fp
--     join public.fornecedor_produtos_publicos v on v.id = fp.id
--    where v.em_estoque is distinct from (fp.estoque > 0);
--
-- security_invoker tem que estar OFF nas duas, senão a view devolve zero:
--   select relname, reloptions from pg_class
--    where relnamespace = 'public'::regnamespace
--      and relname in ('fornecedor_produtos_publicos','fornecedores_publicos');
-- ============================================================================
