import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import Stripe from 'stripe'
import { createAdminClient } from '../../../lib/supabase-admin'
import { rateLimit } from '../../../lib/rate-limit'

// Onboarding da LOJA no Stripe Connect (conta Standard, como o entregador) para
// RECEBER o pagamento dos pedidos online. Cria a conta se não existir e
// redireciona para o onboarding da Stripe; ao voltar, /integracoes?stripe=ok
// consulta /api/loja/stripe-status para confirmar que já pode receber.
export async function GET(request: NextRequest) {
  const cookieStore = await cookies()
  const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } },
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', request.url))

  if (!rateLimit(`loja-connect:${user.id}`, 5, 60_000)) {
    return NextResponse.redirect(new URL('/integracoes?stripe=erro', request.url))
  }
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.redirect(new URL('/integracoes?stripe=indisponivel', request.url))
  }

  const admin = createAdminClient()
  const { data: loja } = await admin
    .from('lojas').select('id, nome, stripe_account_id').eq('user_id', user.id).single()
  if (!loja) return NextResponse.redirect(new URL('/onboarding', request.url))

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
  try {
    let accountId = loja.stripe_account_id
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: 'standard',
        country: 'BR',
        metadata: { loja_id: loja.id },
      })
      accountId = account.id
      await admin.from('lojas').update({ stripe_account_id: accountId }).eq('id', loja.id)
    }

    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${origin}/api/loja/stripe-connect`,
      return_url: `${origin}/integracoes?stripe=ok`,
      type: 'account_onboarding',
    })
    return NextResponse.redirect(link.url, { status: 303 })
  } catch (e) {
    const err = e as { message?: string; code?: string; statusCode?: number; requestId?: string; raw?: { message?: string } }
    console.error('[loja/stripe-connect] falha ao criar conta/link:', {
      message: err?.message, code: err?.code, statusCode: err?.statusCode, requestId: err?.requestId, raw: err?.raw?.message,
    })
    return NextResponse.redirect(new URL('/integracoes?stripe=erro', request.url))
  }
}
