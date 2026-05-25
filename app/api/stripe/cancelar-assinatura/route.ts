import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createAdminClient } from '../../../lib/supabase-admin'
import { cookies } from 'next/headers'
import { rateLimit } from '../../../lib/rate-limit'
import { getStripe } from '../../../lib/stripe'

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
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const { data: loja } = await supabase
    .from('lojas')
    .select('id, stripe_subscription_id')
    .eq('user_id', user.id)
    .single()

  if (!loja?.stripe_subscription_id) {
    return NextResponse.json({ error: 'Nenhuma assinatura ativa encontrada' }, { status: 400 })
  }

  try {
    await getStripe().subscriptions.cancel(loja.stripe_subscription_id)
  } catch (e) {
    console.error('[stripe cancelar] erro ao cancelar:', e)
    return NextResponse.json({ error: 'Erro ao cancelar a assinatura' }, { status: 502 })
  }

  // Desativa imediatamente; o webhook subscription.deleted também é idempotente
  const admin = createAdminClient()
  await admin
    .from('lojas')
    .update({ plano: 'inativo', stripe_subscription_id: null })
    .eq('id', loja.id)

  return NextResponse.json({ ok: true })
}
