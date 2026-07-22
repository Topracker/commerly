-- ============================================================================
-- Commerly — INDICAÇÃO VIRA DESCONTO NA MENSALIDADE
-- 2026-07-22
-- ----------------------------------------------------------------------------
-- Preços: R$ 54,90/mês (normal) e R$ 29,90/mês (Fundadores, 100 primeiros, para
-- sempre). Os valores moram em app/lib/precos.ts — o banco não guarda preço.
--
-- Desconto por indicação (quem indica): 10% por indicação CONFIRMADA, até 40%.
-- Confirmada = o indicado ASSINOU. O marco disso é `indicacoes.assinou_em`:
-- enquanto for null, a indicação existe (a pessoa entrou pelo convite) mas não
-- vale desconto nenhum — senão bastaria criar contas para zerar a mensalidade.
--
-- A FÓRMULA do desconto fica só no TypeScript (lib/precos.ts). Não a duplicamos
-- aqui de propósito: a fórmula do XP já vive em dois lugares e sai do sincronismo
-- toda vez que alguém mexe num só.
--
-- Substitui a recompensa de "1 mês grátis por indicação".
-- ============================================================================

-- ---------------------------------------------------------------------------
-- indicacoes: quando o indicado assinou e qual faixa isso gerou
-- ---------------------------------------------------------------------------
alter table public.indicacoes add column if not exists assinou_em   timestamptz;
alter table public.indicacoes add column if not exists desconto_pct integer;

comment on column public.indicacoes.assinou_em is
  'Quando o indicado assinou. NULL = indicação ainda não conta para desconto.';
comment on column public.indicacoes.desconto_pct is
  'Faixa de desconto (%) do indicador no momento em que esta indicação foi confirmada.';

-- Contar as confirmadas de um indicador é a operação mais quente do sistema
-- (roda no webhook, no checkout e no dashboard).
create index if not exists idx_indicacoes_confirmadas
  on public.indicacoes(indicador_user_id)
  where assinou_em is not null;

-- ---------------------------------------------------------------------------
-- Aposenta o "1 mês grátis"
-- ---------------------------------------------------------------------------
-- Os benefícios abertos viram consumidos: quem os tinha passa a ser atendido
-- pela faixa percentual, que é retroativa (conta as indicações que assinaram).
-- Nada é apagado — o histórico de `beneficios_indicacao` continua auditável.
update public.beneficios_indicacao
   set consumido = true
 where tipo = 'mes_gratis' and consumido = false;
