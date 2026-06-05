import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import Stripe from 'stripe'
import { rateLimit } from '../../../lib/rate-limit'

export async function GET(request: NextRequest) {
  const cookieStore = await cookies()
  const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin

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
  if (!user) return NextResponse.redirect(new URL('/login', request.url))

  if (!rateLimit(`stripe-assinar:${user.id}`, 3, 60_000)) {
    return NextResponse.redirect(new URL('/planos?status=erro', request.url))
  }

  const { data: loja } = await supabase
    .from('lojas')
    .select('id, fundador, plano')
    .eq('user_id', user.id)
    .single()

  if (!loja) return NextResponse.redirect(new URL('/onboarding', request.url))
  if (loja.plano === 'ativo') return NextResponse.redirect(new URL('/planos', request.url))

  const priceId = loja.fundador
    ? process.env.STRIPE_PRICE_FUNDADOR
    : process.env.STRIPE_PRICE_NORMAL

  if (!priceId || !process.env.STRIPE_SECRET_KEY) {
    console.error('[stripe/assinar] Stripe não configurada')
    return NextResponse.redirect(new URL('/planos?status=erro', request.url))
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: user.email,
      client_reference_id: loja.id,
      success_url: `${origin}/planos?status=sucesso`,
      cancel_url: `${origin}/planos?status=erro`,
      subscription_data: {
        metadata: { loja_id: loja.id },
      },
      metadata: { loja_id: loja.id },
      allow_promotion_codes: true,
    })

    if (!session.url) {
      return NextResponse.redirect(new URL('/planos?status=erro', request.url))
    }

    return NextResponse.redirect(session.url, { status: 303 })
  } catch (e) {
    console.error('[stripe/assinar] erro ao criar checkout:', e)
    return NextResponse.redirect(new URL('/planos?status=erro', request.url))
  }
}
