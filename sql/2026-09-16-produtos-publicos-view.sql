-- ============================================================================
-- VITRINE DE PRODUTOS SEM VAZAR CUSTO E ESTOQUE (auditoria, achado L1)
-- ----------------------------------------------------------------------------
-- `produtos` tinha TRÊS policies e uma delas era PERMISSIVE com USING (true):
--
--   usuarios podem gerenciar produtos  PERMISSIVE  ALL     loja_id do dono
--   produtos_select_public             PERMISSIVE  SELECT  true        <-- aqui
--   paywall_plano                      RESTRICTIVE ALL     not plano_bloqueia()
--
-- Postgres soma as PERMISSIVE com OR, então o `true` engolia a cláusula de
-- dono: QUALQUER sessão autenticada (cliente, entregador, fornecedor, um
-- comerciante concorrente) fazia
--
--   GET /rest/v1/produtos?select=*
--
-- e recebia `custo`, `preco_venda`, `quantidade`, `quantidade_minima` e
-- `peso_kg` de TODAS as lojas da plataforma. `custo` é a margem do concorrente;
-- `quantidade` é o estoque real. O painel é client-side e fala direto com o
-- PostgREST pela chave anon — não havia nada entre o navegador e esses dados.
--
-- O RESTRICTIVE não continha o vazamento: `plano_bloqueia()` tem
-- `and l.user_id = auth.uid()` no corpo, ou seja, só morde o DONO. Para um
-- terceiro ele devolve false e `not false` libera.
--
-- Correção: mesmo padrão de `lojas_publicas` e `entregadores_contato` — uma
-- view publica só as colunas de vitrine e a tabela volta a ser exclusiva do
-- dono. O estoque vira o booleano `em_estoque` (quantidade > 0), que é o que a
-- vitrine realmente precisa: as telas filtravam `.gt('quantidade', 0)` e por
-- isso enxergavam a quantidade real.
--
-- Fora da view DE PROPÓSITO: custo, quantidade, quantidade_minima, peso_kg,
-- nutri_analisado_em, created_at.
--
-- A view NÃO filtra linhas (nem `em_estoque`, nem plano da loja) — a regra da
-- casa é filtrar na tela, nunca na view (foi assim que `lojas_publicas` já
-- quebrou o /cliente/buscar). Quem lê decide.
--
-- Quem passa a ler a view (loja de TERCEIRO, com JWT do usuário):
--   app/cliente/loja/[id]/page.tsx      vitrine + PedidoModal
--   app/cliente/buscar/page.tsx         filtro nutricional (tags_nutri)
--   app/cliente/feed/page.tsx           produto marcado em post/story
--   app/components/CriarFestaModal.tsx  busca de loja pelo nome do produto
--   app/api/vision/identificar-prato    unica rota /api/* que le produtos de
--                                       outra loja com client de USUARIO
--
-- Quem continua na tabela: todo o painel do comerciante (propria loja, policy
-- "usuarios podem gerenciar produtos") e o que roda com service role
-- (/loja/[id], /cardapio/[id], pedido-checkout, festa/*, perfilPublico) — o
-- checkout e a festa precisam da `quantidade` real para validar estoque.
--
-- `produtos` NAO esta na publication supabase_realtime: nenhuma subscription
-- depende dessas policies.
--
-- APLICADO em produção em 2026-09-16 via MCP do Supabase.
-- ============================================================================

-- 1. View de vitrine -----------------------------------------------------------
-- security_invoker = off (igual a `lojas_publicas`): a view é dona de postgres e
-- atravessa a RLS de `produtos` de propósito. É o que permite derrubar a policy
-- permissiva sem deixar a vitrine vazia.
drop view if exists public.produtos_publicos;

create view public.produtos_publicos
with (security_invoker = off) as
select
  id,
  loja_id,
  nome,
  descricao,
  preco_venda,
  imagem_url,
  categoria,
  tags_nutri,
  -- NUNCA a quantidade real: a vitrine só precisa saber se dá para pedir.
  quantidade > 0 as em_estoque
from public.produtos;

grant select on public.produtos_publicos to anon, authenticated;

-- 2. A policy que vazava --------------------------------------------------------
-- Depois deste DROP, `produtos` só é legível pelo dono (e pelo service role).
-- Leitor que não migrou para a view recebe ZERO LINHAS SEM `error` — a RLS
-- filtra em silêncio. Por isso o deploy do app tem que vir logo atrás.
drop policy if exists produtos_select_public on public.produtos;

-- ============================================================================
-- Conferência (rodar depois de aplicar)
-- ----------------------------------------------------------------------------
-- Policies restantes: só 'usuarios podem gerenciar produtos' e 'paywall_plano'.
--   select policyname, permissive, cmd, qual from pg_policies
--    where schemaname = 'public' and tablename = 'produtos';
--
-- Colunas da view: 9, sem custo/quantidade/quantidade_minima/peso_kg.
--   select column_name from information_schema.columns
--    where table_schema = 'public' and table_name = 'produtos_publicos'
--    order by ordinal_position;
--
-- security_invoker tem que estar OFF, senão a view devolve zero para o cliente:
--   select reloptions from pg_class
--    where relnamespace = 'public'::regnamespace and relname = 'produtos_publicos';
--
-- O teste que vale é REST com JWT real (set_config('role') NAO aplica RLS e
-- inventa vazamento). Com o token de cliente@teste.com:
--   GET /rest/v1/produtos?select=id,custo,quantidade   -> []
--   GET /rest/v1/produtos_publicos?select=custo        -> 400 (coluna não existe)
-- ============================================================================
