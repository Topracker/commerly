import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import Stripe from 'stripe'
import { createAdminClient } from '../../../lib/supabase-admin'
import { rateLimit } from '../../../lib/rate-limit'

// Onboarding do FORNECEDOR no Stripe Connect (conta Standard, como a loja e o
// entregador). É o que permite receber o pagamento dos pedidos B2B com a
// comissão de 5% da Commerly retida via application_fee.
export async function GET(request: NextRequest) {
  const cookieStore = await cookies()
  const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } },
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/fornecedor/login', request.url))

  if (!rateLimit(`fornecedor-connect:${user.id}`, 5, 60_000)) {
    return NextResponse.redirect(new URL('/fornecedor/configuracoes?stripe=erro', request.url))
  }
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.redirect(new URL('/fornecedor/configuracoes?stripe=indisponivel', request.url))
  }

  const admin = createAdminClient()
  const { data: fornecedor } = await admin
    .from('fornecedores').select('id, nome, stripe_account_id').eq('user_id', user.id).single()
  if (!fornecedor) return NextResponse.redirect(new URL('/fornecedor/onboarding', request.url))

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
  try {
    let accountId = fornecedor.stripe_account_id
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: 'standard',
        country: 'BR',
        metadata: { fornecedor_id: fornecedor.id },
      })
      accountId = account.id
      await admin.from('fornecedores').update({ stripe_account_id: accountId }).eq('id', fornecedor.id)
    }

    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${origin}/api/fornecedor/stripe-connect`,
      return_url: `${origin}/fornecedor/configuracoes?stripe=ok`,
      type: 'account_onboarding',
    })
    return NextResponse.redirect(link.url, { status: 303 })
  } catch (e) {
    console.error('[fornecedor/stripe-connect] falha ao criar conta/link:', e)
    return NextResponse.redirect(new URL('/fornecedor/configuracoes?stripe=erro', request.url))
  }
}
