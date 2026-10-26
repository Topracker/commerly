// ============================================================================
// PREÇOS DA MENSALIDADE — fonte única (código manda, Stripe segue)
// ----------------------------------------------------------------------------
// Todo valor de mensalidade que aparece no app (páginas, checkout, e-mails) sai
// daqui. A Stripe é reconciliada a partir destes números por
// `lib/stripeMensalidade.ts` — não existe "preço do painel da Stripe" que
// divirja do preço do código.
//
// Programa Fundadores: as 100 primeiras lojas cadastradas pagam PRECO_FUNDADOR
// só nas MESES_FUNDADOR primeiras cobranças da 1ª assinatura; depois, o preço
// normal. Na Stripe isso é um cupom `repeating` sobre o Price normal — não
// existe Price de fundador. O uso fica marcado em `lojas.fundador_promo_em`
// (permanente: cancelar e assinar de novo não repete o benefício).
//
// Desconto por indicação: quem indica ganha 10% por indicação CONFIRMADA
// (= o indicado assinou), até 40%. Quem entrou pelo convite ganha, na primeira
// assinatura, o mesmo percentual que o indicador tinha na hora de assinar.
// ============================================================================

/** Mensalidade cheia. */
export const PRECO_NORMAL = 54.90
/** Preço promocional do programa Fundadores (só nos primeiros meses). */
export const PRECO_FUNDADOR = 29.90
/** Quantas cobranças mensais o preço fundador cobre; depois, PRECO_NORMAL. */
export const MESES_FUNDADOR = 2
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

type LojaFundador = { fundador?: boolean | null; fundador_promo_em?: string | null }

/** Fundador que ainda não usou os meses de preço fundador (vale na próxima assinatura). */
export function promoFundadorDisponivel(loja: LojaFundador | null | undefined): boolean {
  return !!loja?.fundador && !loja.fundador_promo_em
}

/** Até quando vai o preço fundador de quem já assinou com ele (null se nunca usou). */
export function fimPromoFundador(loja: LojaFundador | null | undefined): Date | null {
  if (!loja?.fundador || !loja.fundador_promo_em) return null
  const fim = new Date(loja.fundador_promo_em)
  fim.setMonth(fim.getMonth() + MESES_FUNDADOR)
  return fim
}

/** A loja está, agora, dentro dos meses de preço fundador. */
export function emPromoFundador(loja: LojaFundador | null | undefined, agora: Date = new Date()): boolean {
  const fim = fimPromoFundador(loja)
  return !!fim && agora < fim
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
