import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import Stripe from 'stripe'
import { rateLimit } from '../../../lib/rate-limit'

export async function GET(_request: NextRequest) {
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

  if (!rateLimit(`stripe-status:${user.id}`, 30, 60_000)) {
    return NextResponse.json({ error: 'Muitas requisições' }, { status: 429 })
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: 'Configuração inválida' }, { status: 500 })
  }

  const { data: loja } = await supabase
    .from('lojas')
    .select('id, stripe_subscription_id')
    .eq('user_id', user.id)
    .single()

  if (!loja?.stripe_subscription_id) {
    return NextResponse.json({ ativa: false })
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

  try {
    const sub = await stripe.subscriptions.retrieve(loja.stripe_subscription_id)
    const periodEnd = (sub as any).current_period_end as number | undefined

    return NextResponse.json({
      ativa: true,
      cancelAtPeriodEnd: !!sub.cancel_at_period_end,
      status: sub.status,
      validoAte: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    })
  } catch (e: any) {
    if (e?.code === 'resource_missing') {
      return NextResponse.json({ ativa: false })
    }
    console.error('[stripe/status] erro:', e)
    return NextResponse.json({ error: 'Erro ao consultar Stripe' }, { status: 502 })
  }
}
