-- Gamificação ativa + recompensas de indicação.
-- As tabelas (medalhas_usuarios, missoes_usuarios, streaks, xp_usuarios,
-- creditos_mov, beneficios_indicacao) e as colunas de indicacoes/codigos_indicacao
-- já existiam em produção. Este hotfix garante a IDEMPOTÊNCIA da confirmação de
-- indicação: cada indicado só pode ser atribuído a um indicador uma única vez.
-- O route /api/indicacao/registrar depende do erro 23505 para resolver corridas.

-- Dedup defensivo antes de criar a constraint (mantém a linha mais antiga por ctid).
DELETE FROM public.indicacoes a
USING public.indicacoes b
WHERE a.indicado_user_id = b.indicado_user_id
  AND a.indicado_user_id IS NOT NULL
  AND a.ctid > b.ctid;

CREATE UNIQUE INDEX IF NOT EXISTS indicacoes_indicado_user_id_key
  ON public.indicacoes (indicado_user_id)
  WHERE indicado_user_id IS NOT NULL;
