import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import Stripe from 'stripe'
import { createAdminClient } from '../../../lib/supabase-admin'

// Status da conta Stripe Connect da loja: pode receber pagamentos?
// Consulta a Stripe (charges_enabled) e persiste em lojas.stripe_onboarded.
export async function GET(request: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } },
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const admin = createAdminClient()
  const { data: loja } = await admin
    .from('lojas').select('id, stripe_account_id, stripe_onboarded').eq('user_id', user.id).single()
  if (!loja) return NextResponse.json({ error: 'Loja não encontrada' }, { status: 404 })

  if (!loja.stripe_account_id || !process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ conectado: false, onboarded: false })
  }

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
    const acct = await stripe.accounts.retrieve(loja.stripe_account_id)
    const onboarded = !!acct.charges_enabled
    if (onboarded !== loja.stripe_onboarded) {
      await admin.from('lojas').update({ stripe_onboarded: onboarded }).eq('id', loja.id)
    }
    return NextResponse.json({ conectado: true, onboarded })
  } catch (e) {
    console.error('[loja/stripe-status] erro:', e)
    return NextResponse.json({ conectado: true, onboarded: loja.stripe_onboarded })
  }
}
