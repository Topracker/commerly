-- ============================================================================
-- B2B: FECHA O VAZAMENTO (achado L1-bis) — FASE 2
-- ----------------------------------------------------------------------------
-- Continuação de sql/2026-09-17-fornecedores-publicos-view.sql (Fase 1), que
-- criou `fornecedor_produtos_publicos` e `fornecedores_publicos` e trocou os
-- leitores do app SEM tocar nas policies. Com as telas já lendo das views, este
-- arquivo faz o corte de fato.
--
-- Até aqui, as duas policies abaixo (PERMISSIVE / SELECT / USING (true))
-- somavam por OR às policies de dono e deixavam QUALQUER sessão autenticada ler
-- tudo. Baseline medido em produção instantes antes deste drop, com JWT de
-- cliente@teste.com (conta sem papel B2B):
--
--   fornecedor_produtos -> [{"nome":"Óleo de soja 900ml","preco":89.90,"estoque":40}, ...]
--   fornecedores        -> [{"nome":"Fornecedor Teste","cnpj":"41.876.543/0001-54", ...}]
--
-- Depois deste arquivo, as duas tabelas só são legíveis pelo DONO (policies
-- fp_*_own / fornecedor_*_own) e pelo service role. Todo o resto do app lê
-- pelas views.
--
-- Diferente do L1, NÃO há deploy acoplado: as telas já não dependem destas
-- policies desde a Fase 1. Rollback, se algum leitor tiver escapado:
--   create policy fp_select_all on public.fornecedor_produtos
--     for select to authenticated using (true);
--   create policy fornecedor_select_all on public.fornecedores
--     for select to authenticated using (true);
--
-- APLICADO em produção em 2026-09-17 via MCP do Supabase.
-- ============================================================================

drop policy if exists fp_select_all on public.fornecedor_produtos;
drop policy if exists fornecedor_select_all on public.fornecedores;

-- ----------------------------------------------------------------------------
-- ARMADILHA — estas duas policies NÃO são opcionais.
--
-- As policies de dono DESTAS tabelas são POR COMANDO (fp_insert_own,
-- fp_update_own, fp_delete_own) — não existia nenhuma de SELECT. Isso é
-- diferente de `produtos` no L1, cuja policy de dono é `cmd = ALL` e já cobria
-- o SELECT. Resultado do drop acima sozinho, medido em produção: o FORNECEDOR
-- parou de enxergar o próprio cadastro e os próprios produtos, e a área
-- /fornecedor/* inteira caiu (o hook useFornecedor devolvia []).
--
-- Pior: `fp_update_own`/`fp_delete_own` fazem subquery em `fornecedores`, e a
-- RLS também se aplica dentro da expressão da policy — sem SELECT em
-- `fornecedores`, o dono perderia até o direito de EDITAR os próprios produtos.
--
-- `fornecedor_select_own` é auto-contida (compara auth.uid() direto) de
-- propósito: é ela que destrava a subquery de `fp_select_own`.
-- ----------------------------------------------------------------------------
create policy fornecedor_select_own on public.fornecedores
  for select to authenticated
  using (auth.uid() = user_id);

create policy fp_select_own on public.fornecedor_produtos
  for select to authenticated
  using (fornecedor_id in (select id from public.fornecedores where user_id = auth.uid()));

-- ============================================================================
-- Conferência (rodar depois de aplicar)
-- ----------------------------------------------------------------------------
-- Devem sobrar só as policies de dono (select/insert/update/delete _own):
--   select tablename, policyname, permissive, cmd, qual from pg_policies
--    where schemaname = 'public' and tablename in ('fornecedor_produtos','fornecedores')
--    order by tablename, cmd;
--
-- O teste que vale é REST com JWT real (regra 12 — set_config('role') não
-- aplica RLS). Com o token de cliente@teste.com:
--   GET /rest/v1/fornecedor_produtos?select=nome,preco,estoque  -> []
--   GET /rest/v1/fornecedores?select=nome,cnpj                  -> []
--   GET /rest/v1/fornecedor_produtos_publicos?select=nome       -> 10 linhas
-- Com o token do fornecedor dono:
--   GET /rest/v1/fornecedor_produtos?select=nome,estoque        -> 10 linhas, estoque real
-- ============================================================================
