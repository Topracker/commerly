import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { rateLimit } from '../../../lib/rate-limit'

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

  if (!rateLimit(`mp-assinar:${user.id}`, 3, 60_000)) {
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

  const preco = loja.fundador ? 29.90 : 54.99

  // Em ambiente de teste (token TEST-...), o MP recusa pagamento quando o
  // payer_email é o mesmo da conta dona do token ("pagar para si mesmo").
  // Usa a conta de teste comprador nesse caso.
  const isTestToken = process.env.MP_ACCESS_TOKEN?.startsWith('TEST-')
  const payerEmail = isTestToken
    ? (process.env.MP_TEST_BUYER_EMAIL || 'TESTUSER5928632247573938400@testuser.com')
    : user.email

  const res = await fetch('https://api.mercadopago.com/preapproval', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      reason: 'Commerly — Plano Mensal',
      payer_email: payerEmail,
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

  // Não salva nada no banco aqui — o acesso só é liberado após
  // o webhook confirmar o pagamento aprovado
  return NextResponse.redirect(preapproval.init_point)
}
