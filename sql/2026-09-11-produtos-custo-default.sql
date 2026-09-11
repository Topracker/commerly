-- ============================================================================
-- produtos.custo COM DEFAULT 0 (auditoria 2026-09-11, achado P5)
-- ----------------------------------------------------------------------------
-- `custo` é NOT NULL e não tinha default. A tela /produtos sempre manda o
-- campo, mas /api/cardapio/publicar (cardápio digitalizado/gerado pela IA) não
-- tem como saber o custo e não enviava nada: TODA publicação caía em
--   23502: null value in column "custo" violates not-null constraint
-- e o comerciante via só "Não foi possível salvar os produtos."
--
-- A rota passa a mandar `custo: 0` explicitamente; este default é a rede de
-- segurança para qualquer outro insert futuro que esqueça a coluna (scripts,
-- outras features de IA). Não altera nenhuma linha existente.
--
-- APLICADO em produção em 2026-09-11 via MCP do Supabase.
-- ============================================================================

alter table public.produtos alter column custo set default 0;

-- Conferência (column_default deve ser '0'):
-- select column_default from information_schema.columns
--  where table_schema = 'public' and table_name = 'produtos' and column_name = 'custo';
