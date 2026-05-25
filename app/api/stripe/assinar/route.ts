import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { rateLimit } from '../../../lib/rate-limit'
import { getStripe, PRECO_FUNDADOR, PRECO_NORMAL } from '../../../lib/stripe'

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

  // Já tem plano ativo — não cria nova assinatura
  if (loja.plano === 'ativo') return NextResponse.redirect(new URL('/planos', request.url))

  const valor = loja.fundador ? PRECO_FUNDADOR : PRECO_NORMAL

  try {
    const stripe = getStripe()
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      customer_email: user.email,
      client_reference_id: loja.id,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'brl',
            unit_amount: valor,
            recurring: { interval: 'month' },
            product_data: {
              name: loja.fundador ? 'Commerly — Plano Fundador' : 'Commerly — Plano Mensal',
            },
          },
        },
      ],
      subscription_data: {
        metadata: { loja_id: loja.id },
      },
      metadata: { loja_id: loja.id },
      success_url: `${origin}/planos?status=sucesso`,
      cancel_url: `${origin}/planos?status=erro`,
    })

    if (!session.url) {
      console.error('[stripe assinar] sessão sem url')
      return NextResponse.redirect(new URL('/planos?status=erro', request.url))
    }

    return NextResponse.redirect(session.url)
  } catch (e) {
    console.error('[stripe assinar] erro ao criar checkout:', e)
    return NextResponse.redirect(new URL('/planos?status=erro', request.url))
  }
}
