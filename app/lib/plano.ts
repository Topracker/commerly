// ============================================================================
// PLANO DA LOJA — fonte única do "esta loja está em dia?"
// ----------------------------------------------------------------------------
// Até a auditoria de 2026-07-21 o `plano` só pintava um badge no dashboard:
// quem cancelava a assinatura (webhook `customer.subscription.deleted` grava
// plano='inativo') continuava com o app inteiro na mão. Agora este módulo é o
// único lugar que responde à pergunta, e ele vale nos dois lados:
//
//   * cliente  -> useAuth redireciona para /planos quando bloqueada
//   * servidor -> as integrações (MP, PagBank, Stripe Ads, IA) ficam pausadas
//
// Regra: em dia = assinatura ativa OU período de teste ainda correndo.
// ============================================================================

export type PlanoLoja = {
  plano?: string | null
  trial_expira_em?: string | null
}

export type SituacaoPlano = {
  /** Pode usar o app normalmente. */
  liberada: boolean
  /** Assinatura paga em dia. */
  assinante: boolean
  /** Está usando o período de teste (liberada, mas com prazo). */
  emTeste: boolean
  /** Dias inteiros restantes de teste (0 quando não há teste vivo). */
  diasDeTeste: number
}

/** Dias inteiros até uma data ISO (0 se já passou ou não existe). */
function diasAte(iso?: string | null): number {
  if (!iso) return 0
  const ms = new Date(iso).getTime() - Date.now()
  return ms <= 0 ? 0 : Math.ceil(ms / 86_400_000)
}

/**
 * Situação da loja. `plano === 'ativo'` é a assinatura paga; qualquer outro
 * valor só passa enquanto `trial_expira_em` estiver no futuro.
 */
export function situacaoPlano(loja: PlanoLoja | null | undefined): SituacaoPlano {
  if (!loja) return { liberada: false, assinante: false, emTeste: false, diasDeTeste: 0 }
  const assinante = loja.plano === 'ativo'
  const diasDeTeste = diasAte(loja.trial_expira_em)
  const emTeste = !assinante && diasDeTeste > 0
  return { liberada: assinante || emTeste, assinante, emTeste, diasDeTeste }
}

/** Atalho: a loja pode usar o app? */
export function lojaLiberada(loja: PlanoLoja | null | undefined): boolean {
  return situacaoPlano(loja).liberada
}

/**
 * Situação da loja lida do banco. Usada pelas rotas de API para PAUSAR as
 * integrações (Mercado Pago, PagBank, Stripe Ads, IA) de uma loja fora do
 * plano: a conexão continua salva e volta sozinha assim que ela regulariza —
 * nada é desconectado nem apagado.
 *
 * Aceita qualquer client Supabase; use o admin nas rotas de webhook, que não
 * têm sessão do usuário.
 */
export async function situacaoDaLoja(client: any, lojaId: string): Promise<SituacaoPlano> {
  const { data } = await client
    .from('lojas').select('plano, trial_expira_em').eq('id', lojaId).maybeSingle()
  return situacaoPlano(data as PlanoLoja | null)
}

/** Atalho: as integrações desta loja devem rodar agora? */
export async function integracoesAtivas(client: any, lojaId: string): Promise<boolean> {
  return (await situacaoDaLoja(client, lojaId)).liberada
}

/**
 * Rotas do comerciante que continuam acessíveis mesmo com o plano vencido —
 * senão ele não conseguiria nem assinar de novo nem sair da conta.
 */
export const ROTAS_LIVRES_SEM_PLANO = [
  '/planos', '/login', '/cadastro', '/onboarding', '/convite',
  '/termos', '/privacidade', '/suporte', '/contato',
]

export function rotaLivreSemPlano(pathname: string | null | undefined): boolean {
  if (!pathname) return true
  return ROTAS_LIVRES_SEM_PLANO.some(r => pathname === r || pathname.startsWith(r + '/'))
}
