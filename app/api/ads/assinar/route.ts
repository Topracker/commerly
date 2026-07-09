import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import Stripe from 'stripe'
import { rateLimit } from '../../../lib/rate-limit'

/**
 * Commerly Ads: assinatura mensal que destaca a loja na busca.
 * Preço em STRIPE_PRICE_ADS (R$ 49,90/mês).
 *
 * A sessão vai com metadata.tipo='ads' — o webhook usa isso pra NÃO confundir
 * com a assinatura da mensalidade (que ativa `plano`).
 */
export async function GET(request: NextRequest) {
  const cookieStore = await cookies()
  const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } },
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', request.url))

  if (!rateLimit(`ads-assinar:${user.id}`, 3, 60_000)) {
    return NextResponse.redirect(new URL('/ads?status=erro', request.url))
  }

  const { data: loja } = await supabase
    .from('lojas').select('id, destaque_ate, stripe_ads_subscription_id').eq('user_id', user.id).single()
  if (!loja) return NextResponse.redirect(new URL('/onboarding', request.url))

  // Já tem assinatura de Ads ativa: não deixa assinar duas vezes.
  if (loja.stripe_ads_subscription_id) {
    return NextResponse.redirect(new URL('/ads?status=ja_ativo', request.url))
  }

  const priceId = process.env.STRIPE_PRICE_ADS
  if (!priceId || !process.env.STRIPE_SECRET_KEY) {
    console.error('[ads/assinar] Stripe Ads não configurada (STRIPE_PRICE_ADS)')
    return NextResponse.redirect(new URL('/ads?status=erro', request.url))
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: user.email,
      success_url: `${origin}/ads?status=sucesso`,
      cancel_url: `${origin}/ads?status=cancelado`,
      subscription_data: { metadata: { loja_id: loja.id, tipo: 'ads' } },
      metadata: { loja_id: loja.id, tipo: 'ads' },
    })

    if (!session.url) return NextResponse.redirect(new URL('/ads?status=erro', request.url))
    return NextResponse.redirect(session.url, { status: 303 })
  } catch (e) {
    console.error('[ads/assinar] erro ao criar checkout:', e)
    return NextResponse.redirect(new URL('/ads?status=erro', request.url))
  }
}
