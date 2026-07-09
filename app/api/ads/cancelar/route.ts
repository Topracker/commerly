import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import Stripe from 'stripe'
import { createAdminClient } from '../../../lib/supabase-admin'
import { rateLimit } from '../../../lib/rate-limit'

/**
 * Cancela a assinatura do Commerly Ads no fim do período já pago.
 * O destaque continua valendo até `destaque_ate` — o comerciante pagou por ele.
 */
export async function POST() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } },
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 })

  if (!rateLimit(`ads-cancelar:${user.id}`, 5, 60_000)) {
    return NextResponse.json({ erro: 'Muitas requisições' }, { status: 429 })
  }

  const { data: loja } = await supabase
    .from('lojas').select('id, stripe_ads_subscription_id').eq('user_id', user.id).single()
  if (!loja) return NextResponse.json({ erro: 'Loja não encontrada' }, { status: 404 })
  if (!loja.stripe_ads_subscription_id) {
    return NextResponse.json({ erro: 'Você não tem uma assinatura de Ads ativa' }, { status: 400 })
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ erro: 'Stripe não configurada' }, { status: 500 })
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
  try {
    await stripe.subscriptions.update(loja.stripe_ads_subscription_id, { cancel_at_period_end: true })
  } catch (e) {
    console.error('[ads/cancelar] erro no Stripe:', e)
    return NextResponse.json({ erro: 'Falha ao cancelar no Stripe' }, { status: 502 })
  }

  // O webhook (customer.subscription.deleted) limpa a coluna quando o período
  // realmente acabar. Aqui só registramos a intenção de não renovar.
  const admin = createAdminClient()
  await admin.from('lojas').update({ stripe_ads_subscription_id: null }).eq('id', loja.id)

  return NextResponse.json({ ok: true })
}
