import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import Stripe from 'stripe'
import { rateLimit } from '../../../lib/rate-limit'

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

  if (!rateLimit(`stripe-cancelar:${user.id}`, 3, 60_000)) {
    return NextResponse.json({ error: 'Muitas tentativas, tente em instantes' }, { status: 429 })
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    console.error('[stripe/cancelar] Stripe não configurada')
    return NextResponse.json({ error: 'Configuração inválida' }, { status: 500 })
  }

  const { data: loja } = await supabase
    .from('lojas')
    .select('id, stripe_subscription_id')
    .eq('user_id', user.id)
    .single()

  if (!loja?.stripe_subscription_id) {
    return NextResponse.json({ error: 'Nenhuma assinatura ativa encontrada' }, { status: 400 })
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

  try {
    const sub = await stripe.subscriptions.update(loja.stripe_subscription_id, {
      cancel_at_period_end: true,
    })

    const fim = (sub as any).current_period_end
      ? new Date((sub as any).current_period_end * 1000).toISOString()
      : null

    return NextResponse.json({ ok: true, validoAte: fim })
  } catch (e: any) {
    if (e?.code === 'resource_missing') {
      return NextResponse.json({ error: 'Assinatura não encontrada na Stripe' }, { status: 404 })
    }
    console.error('[stripe/cancelar] erro:', e)
    return NextResponse.json({ error: 'Erro ao cancelar assinatura' }, { status: 502 })
  }
}
