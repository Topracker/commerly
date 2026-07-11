import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import Stripe from 'stripe'
import { rateLimit } from '../../../lib/rate-limit'
import { createAdminClient } from '../../../lib/supabase-admin'
import { descontoMensalidade } from '../../../lib/gamificacaoServer'

// Aplica, na próxima cobrança do comerciante, o MELHOR desconto entre:
//  - faixa por faturamento do mês (fidelidade)
//  - nível do comerciante (Prata 10% / Ouro 20% / Diamante 30%)
// e credita meses grátis pendentes de indicação como saldo negativo do cliente.
// Idempotente: nunca reduz o desconto já aplicado e nunca recredita o mesmo mês.

const FAIXAS = [
  { meta: 10000, pct: 15 },
  { meta: 5000, pct: 10 },
]

function couponId(pct: number) { return `commerly_desconto_${pct}` }

async function garantirCupom(stripe: Stripe, pct: number) {
  const id = couponId(pct)
  try {
    return await stripe.coupons.retrieve(id)
  } catch (e: any) {
    if (e?.code === 'resource_missing') {
      return await stripe.coupons.create({ id, percent_off: pct, duration: 'once', name: `Commerly ${pct}%` })
    }
    throw e
  }
}

export async function POST(request: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } },
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (!rateLimit(`stripe-desconto:${user.id}`, 20, 60_000)) return NextResponse.json({ ok: true, aplicado: false })
  if (!process.env.STRIPE_SECRET_KEY) return NextResponse.json({ ok: true, aplicado: false })

  const { data: loja } = await supabase
    .from('lojas').select('id, plano, stripe_subscription_id').eq('user_id', user.id).single()
  if (!loja?.stripe_subscription_id || loja.plano !== 'ativo') {
    return NextResponse.json({ ok: true, aplicado: false })
  }

  // Faturamento do mês (fidelidade) + total de pedidos (nível).
  const agora = new Date()
  const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1)
  const [{ data: vendas }, { data: pedidos }, { count: pedidosTotal }] = await Promise.all([
    supabase.from('vendas').select('valor_total').eq('loja_id', loja.id).gte('created_at', inicioMes.toISOString()),
    supabase.from('pedidos_clientes').select('total').eq('loja_id', loja.id).neq('status', 'cancelado').gte('created_at', inicioMes.toISOString()),
    supabase.from('pedidos_clientes').select('id', { count: 'exact', head: true }).eq('loja_id', loja.id).neq('status', 'cancelado'),
  ])

  const faturamento =
    (vendas || []).reduce((a, v: any) => a + (v.valor_total || 0), 0) +
    (pedidos || []).reduce((a, p: any) => a + (Number(p.total) || 0), 0)
  const faixaPct = FAIXAS.find(f => faturamento >= f.meta)?.pct ?? 0
  const nivelPct = descontoMensalidade(pedidosTotal || 0)
  const melhorPct = Math.max(faixaPct, nivelPct)

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

  try {
    const sub = await stripe.subscriptions.retrieve(loja.stripe_subscription_id, { expand: ['discounts', 'items.data.price'] })

    // 1) Meses grátis pendentes → saldo negativo do cliente (crédito real).
    const admin = createAdminClient()
    const { data: beneficios } = await admin
      .from('beneficios_indicacao')
      .select('id, quantidade')
      .eq('user_id', user.id).eq('tipo', 'mes_gratis').eq('consumido', false)
    const mesesGratis = (beneficios || []).reduce((s: number, b: any) => s + Number(b.quantidade || 0), 0)
    let mesesCreditados = 0
    if (mesesGratis > 0) {
      const item: any = sub.items?.data?.[0]
      const unit = Number(item?.price?.unit_amount || 0)
      const currency = item?.price?.currency || 'brl'
      const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id
      if (unit > 0 && customerId) {
        await stripe.customers.createBalanceTransaction(customerId, {
          amount: -unit * mesesGratis, // negativo = crédito
          currency,
          description: `Commerly · ${mesesGratis} mês(es) grátis por indicação`,
        })
        await admin.from('beneficios_indicacao')
          .update({ consumido: true }).in('id', (beneficios || []).map((b: any) => b.id))
        mesesCreditados = mesesGratis
      }
    }

    // 2) Melhor desconto percentual (nunca faz downgrade).
    let aplicado = false
    if (melhorPct > 0) {
      const cupomIds = (sub.discounts || [])
        .map((d: any) => (typeof d === 'string' ? null : typeof d.coupon === 'string' ? d.coupon : d.coupon?.id))
        .filter(Boolean) as string[]
      // pct atualmente aplicado (extraído do id commerly_desconto_XX).
      const pctAtual = cupomIds.reduce((mx, id) => {
        const m = id.match(/commerly_desconto_(\d+)/)
        return m ? Math.max(mx, Number(m[1])) : mx
      }, 0)
      if (melhorPct > pctAtual) {
        await garantirCupom(stripe, melhorPct)
        await stripe.subscriptions.update(loja.stripe_subscription_id, { discounts: [{ coupon: couponId(melhorPct) }] })
        aplicado = true
      }
    }

    return NextResponse.json({ ok: true, aplicado, pct: melhorPct, faturamento, nivelPct, mesesCreditados })
  } catch (e) {
    console.error('[stripe/aplicar-desconto] erro:', e)
    return NextResponse.json({ ok: true, aplicado: false }, { status: 502 })
  }
}
