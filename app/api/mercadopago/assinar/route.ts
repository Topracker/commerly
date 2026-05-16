import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createAdminClient } from '../../../lib/supabase-admin'
import { cookies } from 'next/headers'

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

  const { data: loja } = await supabase
    .from('lojas')
    .select('id, fundador, mp_assinatura_id')
    .eq('user_id', user.id)
    .single()

  if (!loja) return NextResponse.redirect(new URL('/onboarding', request.url))
  if (loja.mp_assinatura_id) return NextResponse.redirect(new URL('/planos', request.url))

  const preco = loja.fundador ? 29.90 : 54.99

  const res = await fetch('https://api.mercadopago.com/preapproval', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      reason: 'Commerly — Plano Mensal',
      payer_email: user.email,
      auto_recurring: {
        frequency: 1,
        frequency_type: 'months',
        transaction_amount: preco,
        currency_id: 'BRL',
      },
      back_url: `${origin}/planos?status=sucesso`,
      external_reference: loja.id,
      status: 'pending',
      notification_url: `${origin}/api/mercadopago/assinatura-webhook`,
    }),
  })

  if (!res.ok) {
    console.error('[assinar] MP preapproval error:', await res.text())
    return NextResponse.redirect(new URL('/planos?status=erro', request.url))
  }

  const preapproval = await res.json()

  const admin = createAdminClient()
  await admin
    .from('lojas')
    .update({ mp_assinatura_id: preapproval.id })
    .eq('id', loja.id)

  return NextResponse.redirect(preapproval.init_point)
}
