-- ============================================================================
-- CPF do cliente: obrigatório no cadastro + índice único no banco
-- ----------------------------------------------------------------------------
-- Comerciante (lojas.documento) e fornecedor (fornecedores.cnpj) já exigem
-- documento obrigatório no onboarding, validado e com uma barreira real no
-- banco (lojas_documento_uidx). O cliente era o único papel com CPF
-- "(opcional)" — e justamente o papel que também aceita cadastro de menor de
-- 12 a 17 anos com autorização do responsável (só uma checkbox autodeclarada,
-- sem verificação real de identidade do responsável).
--
-- Sem CPF obrigatório + único, nada amarra "1 pessoa = 1 conta cliente": é só
-- usar outro e-mail e marcar a autorização de novo. O limite de cadastro por
-- IP (checarLimiteCadastroIp) não resolve isso (several contas no mesmo IP
-- são normais — família inteira, rede compartilhada). CPF obrigatório + único
-- fecha essa brecha, do mesmo jeito que já fecha pra comerciante e fornecedor.
--
-- A checagem de duplicidade em app/api/cadastro/checar/route.ts JÁ consulta
-- clientes.cpf — mas é só UI (TOCTOU, contorna não preenchendo CPF e falha
-- aberta em erro de rede). Quem segura de verdade é o índice único abaixo,
-- que app/lib/validacoes.ts (erroCpfClienteDuplicado) traduz no 23505.
--
-- Checado ANTES de aplicar (2026-11-25, projeto lghtcidddnngrxkgeolk):
--   select cpf, count(*) from public.clientes
--     where cpf is not null and cpf <> '' group by cpf having count(*) > 1;
--   -> 0 linhas (sem duplicata hoje). Só 3 clientes no total, 2 sem CPF
--   (contas antigas/teste) — essas continuam sem CPF até o dono preencher;
--   não dá pra inventar CPF retroativo. O índice é parcial (ignora NULL/''),
--   então não quebra com elas; só passa a travar duplicata daqui pra frente.
--
-- STATUS: aplicado em produção em 2026-11-25 via SQL Editor do Supabase.
-- ============================================================================

create unique index if not exists clientes_cpf_uidx
  on public.clientes (cpf)
  where cpf is not null and cpf <> '';

-- CONFERÊNCIA depois de aplicar:
--   select indexname from pg_indexes
--     where tablename = 'clientes' and indexname = 'clientes_cpf_uidx';
--   -- deve retornar 1 linha.
