import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import Stripe from 'stripe'
import { createAdminClient } from '../../../lib/supabase-admin'

/**
 * Confirma no Stripe se a conta do fornecedor já pode receber pagamentos e
 * grava `stripe_onboarded`. Chamado ao voltar do onboarding.
 */
export async function GET() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } },
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 })
  if (!process.env.STRIPE_SECRET_KEY) return NextResponse.json({ onboarded: false })

  const admin = createAdminClient()
  const { data: fornecedor } = await admin
    .from('fornecedores').select('id, stripe_account_id, stripe_onboarded').eq('user_id', user.id).single()
  if (!fornecedor?.stripe_account_id) return NextResponse.json({ onboarded: false })

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
  try {
    const account = await stripe.accounts.retrieve(fornecedor.stripe_account_id)
    const onboarded = !!account.charges_enabled && !!account.details_submitted

    if (onboarded !== fornecedor.stripe_onboarded) {
      await admin.from('fornecedores').update({ stripe_onboarded: onboarded }).eq('id', fornecedor.id)
    }
    return NextResponse.json({ onboarded })
  } catch (e) {
    console.error('[fornecedor/stripe-status] erro:', e)
    return NextResponse.json({ onboarded: false })
  }
}
