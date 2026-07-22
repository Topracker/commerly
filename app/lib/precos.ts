// ============================================================================
// PREÇOS DA MENSALIDADE — fonte única (código manda, Stripe segue)
// ----------------------------------------------------------------------------
// Todo valor de mensalidade que aparece no app (páginas, checkout, e-mails) sai
// daqui. A Stripe é reconciliada a partir destes números por
// `lib/stripeMensalidade.ts` — não existe "preço do painel da Stripe" que
// divirja do preço do código.
//
// Desconto por indicação: quem indica ganha 10% por indicação CONFIRMADA
// (= o indicado assinou), até 40%. Quem entrou pelo convite ganha, na primeira
// assinatura, o mesmo percentual que o indicador tinha na hora de assinar.
// ============================================================================

/** Mensalidade cheia. */
export const PRECO_NORMAL = 54.90
/** Preço travado dos primeiros comerciantes (para sempre). */
export const PRECO_FUNDADOR = 29.90
/** Quantas vagas o programa Fundadores tem. */
export const VAGAS_FUNDADOR = 100

/** Desconto (%) por número de indicações confirmadas; 4+ trava no último. */
export const DESCONTOS_INDICACAO = [0, 10, 20, 30, 40] as const
export const DESCONTO_MAX = DESCONTOS_INDICACAO[DESCONTOS_INDICACAO.length - 1]

/** Valor em centavos (o que a Stripe cobra). */
export function centavos(valor: number): number {
  return Math.round(valor * 100)
}

/** Desconto (%) de quem tem `confirmadas` indicações que já assinaram. */
export function pctIndicacoes(confirmadas: number): number {
  if (!Number.isFinite(confirmadas) || confirmadas <= 0) return 0
  return DESCONTOS_INDICACAO[Math.min(Math.floor(confirmadas), DESCONTOS_INDICACAO.length - 1)]
}

/** Preço final com o desconto aplicado (arredondado ao centavo). */
export function precoComDesconto(base: number, pct: number): number {
  if (!pct) return base
  return Math.round(centavos(base) * (100 - pct) / 100) / 100
}

/** Mensalidade da loja conforme o programa Fundadores. */
export function precoBase(fundador: boolean | null | undefined): number {
  return fundador ? PRECO_FUNDADOR : PRECO_NORMAL
}

/** "R$ 54,90" */
export function brl(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

/** Tabela pronta para a UI: quantas indicações → quanto fica a mensalidade. */
export function tabelaDescontos(base: number = PRECO_NORMAL) {
  return DESCONTOS_INDICACAO.map((pct, i) => ({
    indicacoes: i,
    ultimo: i === DESCONTOS_INDICACAO.length - 1,
    pct,
    preco: precoComDesconto(base, pct),
  }))
}
