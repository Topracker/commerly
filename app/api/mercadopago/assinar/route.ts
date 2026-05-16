import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
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
    .select('id, nome')
    .eq('user_id', user.id)
    .single()

  if (!loja) return NextResponse.redirect(new URL('/onboarding', request.url))

  const preferencia = {
    items: [
      {
        title: 'Commerly — Plano Mensal',
        description: 'Acesso completo ao painel de gestão Commerly',
        quantity: 1,
        unit_price: 29.9,
        currency_id: 'BRL',
      },
    ],
    payer: { email: user.email },
    external_reference: loja.id,
    back_urls: {
      success: `${origin}/planos?status=sucesso`,
      failure: `${origin}/planos?status=erro`,
      pending: `${origin}/planos?status=pendente`,
    },
    auto_return: 'approved',
    notification_url: `${origin}/api/mercadopago/assinatura-webhook`,
    statement_descriptor: 'COMMERLY',
  }

  const res = await fetch('https://api.mercadopago.com/checkout/preferences', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`,
    },
    body: JSON.stringify(preferencia),
  })

  if (!res.ok) {
    console.error('[assinar] MP preference error:', await res.text())
    return NextResponse.redirect(new URL('/planos?status=erro', request.url))
  }

  const { init_point } = await res.json()
  return NextResponse.redirect(init_point)
}
