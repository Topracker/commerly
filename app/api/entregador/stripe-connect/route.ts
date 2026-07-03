import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import Stripe from 'stripe'
import { createAdminClient } from '../../../lib/supabase-admin'
import { rateLimit } from '../../../lib/rate-limit'

// Onboarding do entregador no Stripe Connect (conta Express). Cria a conta (se
// ainda não existir) e redireciona para o fluxo de cadastro da Stripe. Ao
// concluir, a Stripe volta para o dashboard, que confere o status.
export async function GET(request: NextRequest) {
  const cookieStore = await cookies()
  const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } },
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/entregador-delivery/login', request.url))

  if (!rateLimit(`entregador-connect:${user.id}`, 5, 60_000)) {
    return NextResponse.redirect(new URL('/entregador-delivery/dashboard?stripe=erro', request.url))
  }
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.redirect(new URL('/entregador-delivery/dashboard?stripe=indisponivel', request.url))
  }

  const admin = createAdminClient()
  const { data: entregador } = await admin
    .from('entregadores').select('id, nome, stripe_account_id').eq('user_id', user.id).single()
  if (!entregador) return NextResponse.redirect(new URL('/entregador-delivery/onboarding', request.url))

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
  try {
    let accountId = entregador.stripe_account_id
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: 'express',
        country: 'BR',
        email: user.email,
        business_type: 'individual',
        capabilities: { transfers: { requested: true } },
        metadata: { entregador_id: entregador.id },
      })
      accountId = account.id
      await admin.from('entregadores').update({ stripe_account_id: accountId }).eq('id', entregador.id)
    }

    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${origin}/api/entregador/stripe-connect`,
      return_url: `${origin}/entregador-delivery/dashboard?stripe=ok`,
      type: 'account_onboarding',
    })
    return NextResponse.redirect(link.url, { status: 303 })
  } catch (e) {
    console.error('[entregador/stripe-connect] erro:', e)
    return NextResponse.redirect(new URL('/entregador-delivery/dashboard?stripe=erro', request.url))
  }
}
