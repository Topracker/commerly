import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import Stripe from 'stripe'
import { rateLimit } from '../../../lib/rate-limit'
import { createAdminClient } from '../../../lib/supabase-admin'
import { precoMensalidade, garantirCupom, garantirCupomFundador } from '../../../lib/stripeMensalidade'
import { descontoDeBoasVindas } from '../../../lib/indicacaoDesconto'
import { promoFundadorDisponivel } from '../../../lib/precos'

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
    .select('id, fundador, fundador_promo_em, plano')
    .eq('user_id', user.id)
    .single()

  if (!loja) return NextResponse.redirect(new URL('/onboarding', request.url))
  if (loja.plano === 'ativo') return NextResponse.redirect(new URL('/planos', request.url))

  if (!process.env.STRIPE_SECRET_KEY) {
    console.error('[stripe/assinar] Stripe não configurada')
    return NextResponse.redirect(new URL('/planos?status=erro', request.url))
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

  // O preço sai do código (lib/precos.ts); o helper garante o Price na Stripe.
  // Todo mundo assina o Price normal — o preço fundador é cupom (abaixo).
  const priceId = await precoMensalidade(stripe)
  if (!priceId) {
    console.error('[stripe/assinar] sem preço de mensalidade na Stripe')
    return NextResponse.redirect(new URL('/planos?status=erro', request.url))
  }

  // Quem entrou por convite leva, na 1ª cobrança, o mesmo percentual que o
  // indicador tem hoje. `indicacoes` é service-role — daí o admin client.
  let pctConvite = 0
  try {
    pctConvite = (await descontoDeBoasVindas(createAdminClient(), user.id)).pct
  } catch (e) {
    console.error('[stripe/assinar] desconto de convite indisponível:', e)
  }

  // Fundador que ainda não usou os 2 meses: cupom `repeating` que já embute o
  // maior entre o preço fundador e o convite (não acumulam). O uso é marcado
  // pelo webhook ao concluir o checkout (`fundador_promo` no metadata).
  const promoFundador = promoFundadorDisponivel(loja)
  let cupom: string | null = null
  try {
    if (promoFundador) cupom = await garantirCupomFundador(stripe, pctConvite)
    else if (pctConvite > 0) cupom = await garantirCupom(stripe, pctConvite, 'once')
  } catch (e) {
    // Sem o cupom do fundador o checkout cobraria o preço cheio de quem tem
    // direito ao promocional: melhor falhar e deixar tentar de novo.
    console.error('[stripe/assinar] falha ao preparar o cupom:', e)
    if (promoFundador) return NextResponse.redirect(new URL('/planos?status=erro', request.url))
  }
  const metadata = { loja_id: loja.id, ...(promoFundador ? { fundador_promo: '1' } : {}) }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: user.email,
      client_reference_id: loja.id,
      success_url: `${origin}/planos?status=sucesso`,
      cancel_url: `${origin}/planos?status=erro`,
      subscription_data: { metadata },
      metadata,
      // A Stripe recusa `discounts` junto de `allow_promotion_codes`: ou o
      // cupom (fundador/convite) já vem aplicado, ou o campo de cupom fica aberto.
      ...(cupom
        ? { discounts: [{ coupon: cupom }] }
        : { allow_promotion_codes: true }),
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
