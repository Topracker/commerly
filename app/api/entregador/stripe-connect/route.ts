import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import Stripe from 'stripe'
import { createAdminClient } from '../../../lib/supabase-admin'
import { rateLimit } from '../../../lib/rate-limit'

// Onboarding do entregador no Stripe Connect (conta STANDARD, API v1).
//
// Por que Standard e não Express: contas Express/Custom exigem que a plataforma
// preencha o "platform profile" (responsabilidade por perdas) no dashboard da
// Stripe — sem isso, o create falha com "review the responsibilities of
// managing losses..." (StripeInvalidRequestError 400). Na conta Standard a
// própria conta conectada assume a responsabilidade, então não há esse pré-req.
//
// Cria a conta (se ainda não existir) e redireciona para o onboarding da
// Stripe. Se a criação falhar mesmo assim, aciona o fallback de pagamento
// manual (flag no banco + mensagem no dashboard).
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
        type: 'standard',
        country: 'BR',
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
    // Deu certo criar/linkar: garante que o flag de pagamento manual esteja
    // desligado (best-effort — a coluna pode ainda não existir em produção).
    await admin.from('entregadores').update({ pagamento_manual: false }).eq('id', entregador.id)
    return NextResponse.redirect(link.url, { status: 303 })
  } catch (e) {
    // Log detalhado nos logs da Vercel (mensagem exata da Stripe).
    const err = e as {
      message?: string; type?: string; code?: string; statusCode?: number
      requestId?: string; raw?: { message?: string }
    }
    console.error('[entregador/stripe-connect] falha ao criar conta/link:', {
      message: err?.message,
      type: err?.type,
      code: err?.code,
      statusCode: err?.statusCode,
      requestId: err?.requestId,
      raw: err?.raw?.message,
    })
    // Fallback: liga o pagamento manual (comerciante paga a corrida por fora)
    // para o entregador não ficar travado. Best-effort — a coluna pode ainda
    // não existir em produção até o SQL ser aplicado; o update simplesmente
    // não faz nada nesse caso, e a mensagem ainda aparece via ?stripe=manual.
    await admin.from('entregadores').update({ pagamento_manual: true }).eq('id', entregador.id)
    return NextResponse.redirect(new URL('/entregador-delivery/dashboard?stripe=manual', request.url))
  }
}
