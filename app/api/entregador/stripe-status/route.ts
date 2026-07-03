import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import Stripe from 'stripe'
import { createAdminClient } from '../../../lib/supabase-admin'

// Confere na Stripe se a conta do entregador já pode receber (payouts_enabled)
// e persiste stripe_onboarded. Chamado pelo dashboard ao carregar / ao voltar
// do onboarding.
export async function GET(request: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } },
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ onboarded: false }, { status: 401 })

  const admin = createAdminClient()
  const { data: entregador } = await admin
    .from('entregadores').select('id, stripe_account_id, stripe_onboarded').eq('user_id', user.id).single()
  if (!entregador) return NextResponse.json({ onboarded: false, hasAccount: false })
  if (!entregador.stripe_account_id || !process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ onboarded: false, hasAccount: false })
  }

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
    const acct = await stripe.accounts.retrieve(entregador.stripe_account_id)
    const onboarded = !!acct.payouts_enabled && !!acct.details_submitted
    if (onboarded !== entregador.stripe_onboarded) {
      await admin.from('entregadores').update({ stripe_onboarded: onboarded }).eq('id', entregador.id)
    }
    return NextResponse.json({ onboarded, hasAccount: true })
  } catch (e) {
    console.error('[entregador/stripe-status] erro:', e)
    return NextResponse.json({ onboarded: entregador.stripe_onboarded, hasAccount: true })
  }
}
