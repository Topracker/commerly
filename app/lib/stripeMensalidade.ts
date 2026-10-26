import Stripe from 'stripe'
import { MESES_FUNDADOR, PRECO_FUNDADOR, PRECO_NORMAL, centavos } from './precos'

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
// Só existe o Price normal. O preço fundador é um CUPOM `repeating` de
// MESES_FUNDADOR meses sobre ele (ver garantirCupomFundador): a própria Stripe
// encerra o desconto, sem webhook nem cron. O antigo Price
// `commerly_mensal_fundador` (R$29,90 recorrente, que cobrava para sempre)
// ficou sem uso.
//
// Assinaturas já existentes continuam no Price antigo (a Stripe não remaneja
// ninguém sozinha); a mudança vale para quem assinar daqui para frente.
// ============================================================================

const LOOKUP_NORMAL = 'commerly_mensal_normal'
const NOME_PRODUTO = 'Commerly — Mensalidade'

/** Descobre o produto ao qual o novo Price deve ser pendurado. */
async function produtoDaMensalidade(stripe: Stripe, precoAtual: Stripe.Price | null): Promise<string> {
  if (precoAtual) {
    return typeof precoAtual.product === 'string' ? precoAtual.product : precoAtual.product.id
  }
  const envId = process.env.STRIPE_PRICE_NORMAL
  if (envId) {
    try {
      const p = await stripe.prices.retrieve(envId)
      return typeof p.product === 'string' ? p.product : p.product.id
    } catch { /* env aponta para um price morto: cria produto novo */ }
  }
  const prod = await stripe.products.create({ name: NOME_PRODUTO })
  return prod.id
}

/**
 * Price mensal em BRL com o valor que `lib/precos.ts` manda, criando-o na
 * Stripe se ainda não existir. Em caso de falha de rede/API cai no id da env
 * para não derrubar o checkout.
 */
export async function precoMensalidade(stripe: Stripe): Promise<string | null> {
  const alvo = centavos(PRECO_NORMAL)
  const envId = process.env.STRIPE_PRICE_NORMAL || null

  try {
    const { data } = await stripe.prices.list({ lookup_keys: [LOOKUP_NORMAL], active: true, limit: 1 })
    const atual = data[0] ?? null
    if (atual && atual.unit_amount === alvo && atual.currency === 'brl' && atual.recurring?.interval === 'month') {
      return atual.id
    }

    const novo = await stripe.prices.create({
      currency: 'brl',
      unit_amount: alvo,
      recurring: { interval: 'month' },
      product: await produtoDaMensalidade(stripe, atual),
      lookup_key: LOOKUP_NORMAL,
      transfer_lookup_key: true,
      nickname: `${NOME_PRODUTO} · ${(alvo / 100).toFixed(2)}`,
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
// `repeating` = preço fundador (MESES_FUNDADOR cobranças; ver abaixo).

export type DuracaoCupom = 'once' | 'forever'

export function cupomId(pct: number, duracao: DuracaoCupom): string {
  return duracao === 'forever' ? `commerly_indicacao_${pct}` : `commerly_desconto_${pct}`
}

/** Desconto, em centavos, que leva o Price normal ao preço fundador. */
const OFF_FUNDADOR = centavos(PRECO_NORMAL - PRECO_FUNDADOR)
/** O mesmo desconto em % do preço normal (para comparar com os outros cupons). */
const PCT_FUNDADOR = (OFF_FUNDADOR / centavos(PRECO_NORMAL)) * 100

/**
 * Id do cupom de um Discount expandido. Na API atual o cupom mora em
 * `discount.source.coupon`; `discount.coupon` é o formato antigo. Lendo só o
 * antigo, o desconto atual parecia sempre 0% e qualquer desconto menor
 * sobrescrevia o que já estava aplicado (inclusive o do fundador).
 */
export function idCupomDoDesconto(d: string | Stripe.Discount | null | undefined): string | null {
  if (!d || typeof d === 'string') return null // não expandido: é o id do desconto, não do cupom
  const c = d.source?.coupon ?? (d as unknown as { coupon?: string | Stripe.Coupon | null }).coupon
  return typeof c === 'string' ? c : c?.id ?? null
}

/**
 * Percentual (sobre o preço normal) de um cupom nosso; 0 se não for nosso.
 * `commerly_desconto_30` → 30; `commerly_fundador_2500_2m` → ~45,5;
 * `commerly_fundador_pct50_2m` → 50.
 */
export function pctDoCupom(id: string): number {
  const m = /^commerly_(?:desconto|indicacao)_(\d+)$/.exec(id)
  if (m) return Number(m[1])
  const f = /^commerly_fundador_(pct)?(\d+)_\d+m$/.exec(id)
  if (f) return f[1] ? Number(f[2]) : (Number(f[2]) / centavos(PRECO_NORMAL)) * 100
  return 0
}

/**
 * Cupom da 1ª assinatura de um fundador: PRECO_FUNDADOR nas MESES_FUNDADOR
 * primeiras cobranças, depois o preço normal (a Stripe encerra sozinha).
 *
 * Não acumula com o desconto de boas-vindas de quem veio por convite: fica o
 * MAIOR dos dois, e ele vale pelos mesmos MESES_FUNDADOR meses. Com os números
 * de hoje o fundador sempre ganha (R$25 ≈ 45,5% contra no máximo 40%), mas a
 * comparação fica aqui para não depender disso.
 *
 * O id carrega valor e prazo — cupom da Stripe é imutável, então mudar
 * `lib/precos.ts` cria um cupom novo em vez de reaproveitar um errado.
 */
export async function garantirCupomFundador(stripe: Stripe, pctConvite: number): Promise<string> {
  const porConvite = pctConvite > PCT_FUNDADOR
  const id = porConvite
    ? `commerly_fundador_pct${pctConvite}_${MESES_FUNDADOR}m`
    : `commerly_fundador_${OFF_FUNDADOR}_${MESES_FUNDADOR}m`
  try {
    await stripe.coupons.retrieve(id)
  } catch (e) {
    if ((e as { code?: string } | null)?.code !== 'resource_missing') throw e
    await stripe.coupons.create(porConvite
      ? {
        id, percent_off: pctConvite, duration: 'repeating', duration_in_months: MESES_FUNDADOR,
        name: `Commerly · Fundador ${pctConvite}% (${MESES_FUNDADOR} meses)`,
      }
      : {
        id, amount_off: OFF_FUNDADOR, currency: 'brl', duration: 'repeating', duration_in_months: MESES_FUNDADOR,
        name: `Commerly · Fundador (${MESES_FUNDADOR} meses)`,
      })
  }
  return id
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
 *
 * É isto que protege o preço fundador: o cupom dele vale ~45,5%, acima de
 * qualquer indicação/faixa/nível, então nada o substitui durante os meses de
 * promoção. Quando a Stripe o encerra, ele sai de `sub.discounts` e a próxima
 * reconciliação (/api/stripe/aplicar-desconto) aplica o desconto que couber.
 */
export async function aplicarDescontoAssinatura(
  stripe: Stripe, subscriptionId: string, pct: number, duracao: DuracaoCupom,
): Promise<{ aplicado: boolean; pctAtual: number }> {
  const sub = await stripe.subscriptions.retrieve(subscriptionId, { expand: ['discounts'] })
  const pctAtual = (sub.discounts || []).reduce((mx: number, d) => {
    const id = idCupomDoDesconto(d)
    return Math.max(mx, id ? pctDoCupom(id) : 0)
  }, 0)

  if (pct <= 0 || pct <= pctAtual) return { aplicado: false, pctAtual }

  const coupon = await garantirCupom(stripe, pct, duracao)
  await stripe.subscriptions.update(subscriptionId, { discounts: [{ coupon }] })
  return { aplicado: true, pctAtual: pct }
}
