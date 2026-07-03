import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import Stripe from 'stripe'
import { rateLimit } from '../../../lib/rate-limit'

// Faixas de desconto por faturamento mensal. A meta maior tem prioridade.
// percent_off é universal: vale tanto pro preço normal quanto pro fundador.
const FAIXAS = [
  { meta: 10000, pct: 15, couponId: 'commerly_fidelidade_15', nome: 'Commerly Fidelidade 15%' },
  { meta: 5000, pct: 10, couponId: 'commerly_fidelidade_10', nome: 'Commerly Fidelidade 10%' },
]

// Cria o cupom uma única vez (id fixo) e reaproveita nas próximas vezes.
// duration 'once' = o desconto incide só na próxima cobrança.
async function garantirCupom(stripe: Stripe, id: string, percentOff: number, nome: string) {
  try {
    return await stripe.coupons.retrieve(id)
  } catch (e: any) {
    if (e?.code === 'resource_missing') {
      return await stripe.coupons.create({ id, percent_off: percentOff, duration: 'once', name: nome })
    }
    throw e
  }
}

export async function POST(request: NextRequest) {
  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll() {},
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  if (!rateLimit(`stripe-desconto:${user.id}`, 20, 60_000)) {
    return NextResponse.json({ ok: true, aplicado: false })
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ ok: true, aplicado: false })
  }

  const { data: loja } = await supabase
    .from('lojas')
    .select('id, plano, stripe_subscription_id')
    .eq('user_id', user.id)
    .single()

  // Sem assinatura ativa não há próxima cobrança pra descontar.
  if (!loja?.stripe_subscription_id || loja.plano !== 'ativo') {
    return NextResponse.json({ ok: true, aplicado: false })
  }

  // Faturamento do mês corrente (mesmo cálculo do dashboard):
  // vendas manuais/integrações + pedidos online (delivery), exceto cancelados.
  const agora = new Date()
  const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1)
  const [{ data: vendas, error: vendasErr }, { data: pedidos, error: pedidosErr }] = await Promise.all([
    supabase
      .from('vendas')
      .select('valor_total')
      .eq('loja_id', loja.id)
      .gte('created_at', inicioMes.toISOString()),
    supabase
      .from('pedidos_clientes')
      .select('total')
      .eq('loja_id', loja.id)
      .neq('status', 'cancelado')
      .gte('created_at', inicioMes.toISOString()),
  ])

  if (vendasErr || pedidosErr) {
    console.error('[stripe/aplicar-desconto] erro ao somar faturamento:', vendasErr || pedidosErr)
    return NextResponse.json({ ok: true, aplicado: false })
  }

  const faturamento =
    (vendas || []).reduce((a, v: any) => a + (v.valor_total || 0), 0) +
    (pedidos || []).reduce((a, p: any) => a + (Number(p.total) || 0), 0)
  const faixa = FAIXAS.find(f => faturamento >= f.meta)
  if (!faixa) return NextResponse.json({ ok: true, aplicado: false, faturamento })

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

  try {
    // Estado atual do desconto no Stripe é a fonte de verdade pro dedupe:
    // evita reaplicar a cada venda e nunca faz downgrade da faixa.
    const sub = await stripe.subscriptions.retrieve(loja.stripe_subscription_id, { expand: ['discounts'] })
    const cuponsAtuais = (sub.discounts || [])
      .map((d: any) => (typeof d === 'string' ? null : typeof d.coupon === 'string' ? d.coupon : d.coupon?.id))
      .filter(Boolean) as string[]

    if (cuponsAtuais.includes(faixa.couponId)) {
      return NextResponse.json({ ok: true, aplicado: false, jaAplicado: true, pct: faixa.pct, faturamento })
    }

    await garantirCupom(stripe, faixa.couponId, faixa.pct, faixa.nome)
    await stripe.subscriptions.update(loja.stripe_subscription_id, {
      discounts: [{ coupon: faixa.couponId }],
    })

    return NextResponse.json({ ok: true, aplicado: true, pct: faixa.pct, faturamento })
  } catch (e) {
    console.error('[stripe/aplicar-desconto] erro ao aplicar cupom:', e)
    return NextResponse.json({ ok: true, aplicado: false }, { status: 502 })
  }
}
