import Stripe from 'stripe'
import { PRECO_FUNDADOR, PRECO_NORMAL, centavos } from './precos'

// ============================================================================
// STRIPE DA MENSALIDADE — preço e cupons
// ----------------------------------------------------------------------------
// O preço é definido em `lib/precos.ts`. Este módulo garante que a Stripe tenha
// um Price ativo com EXATAMENTE aquele valor e devolve o id dele.
//
// Por que não confiar só na env `STRIPE_PRICE_NORMAL`: um Price da Stripe é
// imutável — mudar o valor significa criar outro objeto. Se o preço do código
// e o id da env divergirem (foi o que aconteceu quando a mensalidade passou de
// R$54,99 para R$54,90), o app anuncia um valor e cobra outro. Aqui o código é
// a fonte da verdade: procuramos o Price pela `lookup_key`, conferimos o valor
// e criamos um novo (transferindo a lookup_key) quando o valor mudou. A env
// vira só o ponto de partida — de onde saem o produto e o fallback.
//
// Assinaturas já existentes continuam no Price antigo (a Stripe não remaneja
// ninguém sozinha); a mudança vale para quem assinar daqui para frente.
// ============================================================================

const LOOKUP = {
  normal: 'commerly_mensal_normal',
  fundador: 'commerly_mensal_fundador',
} as const

const NOME_PRODUTO = {
  normal: 'Commerly — Mensalidade',
  fundador: 'Commerly — Mensalidade (Fundador)',
} as const

/** Descobre o produto ao qual o novo Price deve ser pendurado. */
async function produtoDaMensalidade(
  stripe: Stripe, tier: 'normal' | 'fundador', precoAtual: Stripe.Price | null,
): Promise<string> {
  if (precoAtual) {
    return typeof precoAtual.product === 'string' ? precoAtual.product : precoAtual.product.id
  }
  const envId = tier === 'fundador' ? process.env.STRIPE_PRICE_FUNDADOR : process.env.STRIPE_PRICE_NORMAL
  if (envId) {
    try {
      const p = await stripe.prices.retrieve(envId)
      return typeof p.product === 'string' ? p.product : p.product.id
    } catch { /* env aponta para um price morto: cria produto novo */ }
  }
  const prod = await stripe.products.create({ name: NOME_PRODUTO[tier] })
  return prod.id
}

/**
 * Price mensal em BRL com o valor que `lib/precos.ts` manda, criando-o na
 * Stripe se ainda não existir. Em caso de falha de rede/API cai no id da env
 * para não derrubar o checkout.
 */
export async function precoMensalidade(stripe: Stripe, fundador: boolean): Promise<string | null> {
  const tier = fundador ? 'fundador' : 'normal'
  const alvo = centavos(fundador ? PRECO_FUNDADOR : PRECO_NORMAL)
  const envId = (fundador ? process.env.STRIPE_PRICE_FUNDADOR : process.env.STRIPE_PRICE_NORMAL) || null

  try {
    const { data } = await stripe.prices.list({ lookup_keys: [LOOKUP[tier]], active: true, limit: 1 })
    const atual = data[0] ?? null
    if (atual && atual.unit_amount === alvo && atual.currency === 'brl' && atual.recurring?.interval === 'month') {
      return atual.id
    }

    const novo = await stripe.prices.create({
      currency: 'brl',
      unit_amount: alvo,
      recurring: { interval: 'month' },
      product: await produtoDaMensalidade(stripe, tier, atual),
      lookup_key: LOOKUP[tier],
      transfer_lookup_key: true,
      nickname: `${NOME_PRODUTO[tier]} · ${(alvo / 100).toFixed(2)}`,
    })
    return novo.id
  } catch (e) {
    console.error('[stripeMensalidade] falha ao sincronizar o preço, usando a env:', e)
    return envId
  }
}

// ---------------------------------------------------------------------------
// Cupons
// ---------------------------------------------------------------------------
// `forever` = desconto por indicação do INDICADOR (vale enquanto ele mantiver
// as indicações). `once` = benefício de uma cobrança só (faixa de faturamento,
// nível, e o desconto de boas-vindas de quem entrou por convite).

export type DuracaoCupom = 'once' | 'forever'

export function cupomId(pct: number, duracao: DuracaoCupom): string {
  return duracao === 'forever' ? `commerly_indicacao_${pct}` : `commerly_desconto_${pct}`
}

/** Percentual embutido no id do cupom (`..._30` → 30); 0 se não for nosso. */
export function pctDoCupom(id: string): number {
  const m = /^commerly_(?:desconto|indicacao)_(\d+)$/.exec(id)
  return m ? Number(m[1]) : 0
}

export async function garantirCupom(stripe: Stripe, pct: number, duracao: DuracaoCupom): Promise<string> {
  const id = cupomId(pct, duracao)
  try {
    await stripe.coupons.retrieve(id)
  } catch (e: any) {
    if (e?.code !== 'resource_missing') throw e
    await stripe.coupons.create({
      id, percent_off: pct, duration: duracao,
      name: duracao === 'forever' ? `Commerly · indicação ${pct}%` : `Commerly ${pct}%`,
    })
  }
  return id
}

/**
 * Aplica `pct` de desconto na assinatura — só quando é MELHOR que o desconto
 * que já está lá. Nunca rebaixa: o comerciante não perde um benefício porque
 * uma rotina rodou fora de ordem. Idempotente.
 */
export async function aplicarDescontoAssinatura(
  stripe: Stripe, subscriptionId: string, pct: number, duracao: DuracaoCupom,
): Promise<{ aplicado: boolean; pctAtual: number }> {
  const sub = await stripe.subscriptions.retrieve(subscriptionId, { expand: ['discounts'] })
  const pctAtual = (sub.discounts || []).reduce((mx: number, d: any) => {
    const id = typeof d === 'string' ? d : typeof d.coupon === 'string' ? d.coupon : d.coupon?.id
    return Math.max(mx, id ? pctDoCupom(String(id)) : 0)
  }, 0)

  if (pct <= 0 || pct <= pctAtual) return { aplicado: false, pctAtual }

  const coupon = await garantirCupom(stripe, pct, duracao)
  await stripe.subscriptions.update(subscriptionId, { discounts: [{ coupon }] })
  return { aplicado: true, pctAtual: pct }
}
