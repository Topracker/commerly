-- ============================================================================
-- RLS: promocoes / combos / flash_sales deixam de ser legíveis por qualquer um
-- ----------------------------------------------------------------------------
-- Mesma classe do L1 (produtos) e do L1-bis (B2B): policy PERMISSIVE
-- `SELECT USING (true)` para o role `public` — anon inclusive — somando com a
-- policy de dono. Aqui não vaza custo nem PII; vaza INTENÇÃO comercial:
-- promoção inativa/expirada (preço futuro e histórico), combo inativo e a
-- métrica `vezes_juntos`, tudo de todas as lojas. E `combos`/`flash_sales`
-- não tinham NENHUM leitor anônimo — a policy pública não servia a ninguém.
--
-- Leitores reconfirmados em 2026-09-19 (nenhum precisa de anon):
--   promocoes   /cliente/loja (authenticated, já filtra ativa), painel do dono,
--               /api/promocoes/aplicar (dono, client do usuário);
--               /loja, /cardapio, checkout, festa/* usam SERVICE ROLE.
--               preco_efetivo() é INVOKER mas só roda dentro do guard
--               SECURITY DEFINER (dono postgres, bypassa RLS) — intocada.
--   combos      só o painel do dono (/combos).
--   flash_sales /api/flash-sale: GET com service role; POST com o client do
--               FORNECEDOR (conta ativas + .select() do insert).
--   Nenhuma das três está na publication supabase_realtime.
--
-- ARMADILHA (a mesma do L1-bis): `flash_sales` tem policies de dono POR
-- COMANDO (insert/update/delete) e nenhuma de SELECT. Derrubar a pública sem
-- criar `flash_sales_select_dono` quebraria o POST em silêncio (contagem
-- vazia + RETURNING negado). `combos` e `promocoes` têm dono com cmd=ALL.
--
-- Rollout em 2 fases, cada uma aplicada como migração própria:
--   FASE 1 (aditiva): cria as policies novas ao lado das antigas — nada muda
--           para ninguém, só prova que as novas existem e funcionam.
--   FASE 2: derruba as três `*_select_public`. Sem deploy no meio porque
--           NENHUMA linha de código muda (os leitores já são authenticated e
--           já filtram) — a fase 2 só fecha o que a fase 1 preparou.
--
-- Aplicado em produção via MCP em 2026-09-19 (fase 1 e fase 2).
-- ============================================================================

-- ───────────────────────────── FASE 1 ──────────────────────────────────────

-- Cliente logado vê só promoção VIVA. Mesmo filtro de preco_efetivo().
create policy promocoes_select_ativas on public.promocoes
  for select to authenticated
  using (ativa and (expira_em is null or expira_em > now()));

-- Combo inativo é rascunho do dono; terceiro só vê o que está no ar.
create policy combos_select_ativos on public.combos
  for select to authenticated
  using (ativo);

-- Flash sale dentro da janela. inicia_em e termina_em são NOT NULL.
create policy flash_sales_select_vigentes on public.flash_sales
  for select to authenticated
  using (inicia_em <= now() and termina_em > now());

-- O dono (fornecedor) precisa ler as próprias, vigentes ou não — é o que o
-- POST /api/flash-sale faz para contar ativas e devolver a criada.
-- Auto-contida: `fornecedores` tem fornecedor_select_own, então a subquery
-- enxerga a linha do próprio dono.
create policy flash_sales_select_dono on public.flash_sales
  for select to authenticated
  using (exists (select 1 from public.fornecedores f
                  where f.id = flash_sales.fornecedor_id and f.user_id = auth.uid()));

-- ───────────────────────────── FASE 2 ──────────────────────────────────────

drop policy if exists promocoes_select_public   on public.promocoes;
drop policy if exists combos_select_public      on public.combos;
drop policy if exists flash_sales_select_public on public.flash_sales;

-- Conferência:
--   select tablename, policyname, cmd, roles, qual from pg_policies
--    where tablename in ('promocoes','combos','flash_sales') order by 1,2;
-- Esperado: nenhuma `*_select_public`; dono (ALL / por comando + select_dono)
-- + `*_select_ativas|ativos|vigentes` para authenticated + paywall_plano.
-- Rollback: recriar `create policy <t>_select_public on <t> for select using (true);`
