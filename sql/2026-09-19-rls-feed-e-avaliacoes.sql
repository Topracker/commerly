-- ============================================================================
-- RLS: feed social e avaliações deixam de ser legíveis por qualquer um
-- ----------------------------------------------------------------------------
-- Último lote da classe L1 / L1-bis / promocoes-combos-flash_sales: policy
-- PERMISSIVE `SELECT USING (true)` para o role `public` (anon inclusive)
-- somando com a policy de dono. Aqui não vaza custo nem PII — `cliente_id` é
-- opaco (`clientes` só é legível pelo dono) — mas o padrão está errado:
-- NENHUM leitor dessas tabelas é anônimo. Quem lê no navegador é sempre
-- `authenticated`; as páginas públicas (/loja, /cardapio, perfis por slug)
-- usam SERVICE ROLE no servidor.
--
-- Leitores reconfirmados em 2026-09-19 (grep em app/, nada em realtime):
--   posts             /cliente/feed (todos os posts, sem filtro), /posts (dono)
--   stories           /cliente/feed e /posts, os DOIS filtram expira_em > now()
--   loja_seguidores   /cliente/feed (as minhas), /cliente/loja/[id] (a minha +
--                     COUNT da loja), /posts (COUNT da própria loja)
--   post_likes        /cliente/feed (todas, para contar e marcar as minhas)
--   post_comentarios  /cliente/feed (todos dos posts carregados)
--   avaliacoes_lojas / avaliacoes_entregadores
--                     já eram só `authenticated`, mas com USING (true). TODO
--                     leitor com JWT passa pelas views `*_atuais`
--                     (security_invoker, WHERE not substituida). A versão
--                     antiga de uma avaliação editada (log append-only) era
--                     legível por qualquer logado direto na tabela; passa a
--                     ser só do service role (/api/avaliacoes, /verificar).
--   avaliacoes_fornecedores
--                     INTOCADA: já é `authenticated`, não tem coluna para
--                     filtrar, e todos os leitores (fornecedor dono, loja
--                     avaliando em /fornecedor/[id], embed em /fornecedores)
--                     precisam de todas as linhas.
--
-- Checagem da ARMADILHA (L1-bis/flash_sales: dono sem policy de SELECT ao
-- derrubar a pública). Quem cobre o SELECT do usuário legítimo depois:
--   posts / stories          posts_loja_write / stories_loja_write (cmd=ALL)
--   loja_seguidores          loja_seguidores_cliente (ALL) + count via nova
--   post_likes               post_likes_cliente (ALL)
--   post_comentarios         post_comentarios_cliente (ALL); a de loja é só
--                            DELETE e não precisa de SELECT (sem RETURNING)
--   avaliacoes_lojas/entreg. NÃO têm policy de escrita (tudo via service
--                            role em /api/avaliacoes); nenhum leitor com JWT
--                            precisa de linha substituída.
-- Triggers (gamif_avaliacao, notif_post_novo) são SECURITY DEFINER.
--
-- Rollout em 2 fases, como sempre:
--   FASE 1 (aditiva): cria as policies novas ao lado das antigas.
--   FASE 2: derruba as `*_select` públicas. Sem deploy no meio — nenhuma
--           linha de código muda.
--
-- Aplicado em produção via MCP em 2026-09-19 (fase 1 e fase 2), validado
-- pela REST com JWT real das 4 contas de teste + anon.
-- ============================================================================

-- ───────────────────────────── FASE 1 ──────────────────────────────────────

-- Feed: qualquer logado vê todos os posts (é o produto). Só sai o anon.
create policy posts_select_authenticated on public.posts
  for select to authenticated
  using (true);

-- Story vencido é histórico do dono; terceiro só vê o que está no ar.
create policy stories_select_vigentes on public.stories
  for select to authenticated
  using (expira_em > now());

-- Contagem de seguidores de qualquer loja (tela do cliente e do dono).
create policy loja_seguidores_select_authenticated on public.loja_seguidores
  for select to authenticated
  using (true);

-- Contagem de curtidas por post no feed.
create policy post_likes_select_authenticated on public.post_likes
  for select to authenticated
  using (true);

-- Comentários dos posts do feed.
create policy post_comentarios_select_authenticated on public.post_comentarios
  for select to authenticated
  using (true);

-- Avaliação: só a versão atual. Mesmo filtro das views *_atuais.
create policy avaliacoes_lojas_select_atuais on public.avaliacoes_lojas
  for select to authenticated
  using (not substituida);

create policy avaliacoes_entregadores_select_atuais on public.avaliacoes_entregadores
  for select to authenticated
  using (not substituida);

-- ───────────────────────────── FASE 2 ──────────────────────────────────────

drop policy if exists posts_select            on public.posts;
drop policy if exists stories_select          on public.stories;
drop policy if exists loja_seguidores_select  on public.loja_seguidores;
drop policy if exists post_likes_select       on public.post_likes;
drop policy if exists post_comentarios_select on public.post_comentarios;
drop policy if exists aval_lojas_select       on public.avaliacoes_lojas;
drop policy if exists aval_entregador_select  on public.avaliacoes_entregadores;

-- Conferência:
--   select tablename, policyname, cmd, roles, qual from pg_policies
--    where tablename in ('posts','stories','loja_seguidores','post_likes',
--                        'post_comentarios','avaliacoes_lojas',
--                        'avaliacoes_entregadores') order by 1,2;
-- Esperado: nenhuma policy com roles={public} e qual=true; dono (ALL) +
-- `*_select_authenticated|vigentes|atuais` + paywall_plano onde já existia.
-- Rollback: recriar `create policy <nome antigo> on <t> for select using (true);`
-- (para as duas de avaliações, `to authenticated`).
