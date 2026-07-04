import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import Stripe from 'stripe'
import { rateLimit } from '../../../lib/rate-limit'

// Histórico de faturas (invoices) da assinatura/mensalidade da loja.
// As invoices são geradas AUTOMATICAMENTE pela Stripe a cada ciclo da
// subscription — aqui só as listamos para o comerciante ver/baixar o PDF.
export async function GET(request: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } },
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (!rateLimit(`faturas:${user.id}`, 20, 60_000)) {
    return NextResponse.json({ error: 'Muitas tentativas. Aguarde.' }, { status: 429 })
  }
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: 'Faturamento indisponível no momento.' }, { status: 503 })
  }

  const { data: loja } = await supabase
    .from('lojas').select('stripe_subscription_id').eq('user_id', user.id).single()
  if (!loja) return NextResponse.json({ error: 'Loja não encontrada.' }, { status: 404 })

  // Sem assinatura ainda: nada a mostrar (não é erro).
  if (!loja.stripe_subscription_id) return NextResponse.json({ faturas: [] })

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
    const lista = await stripe.invoices.list({ subscription: loja.stripe_subscription_id, limit: 24 })
    const faturas = lista.data.map(inv => ({
      id: inv.id,
      numero: inv.number,
      criada_em: inv.created * 1000, // ms
      valor: (inv.amount_paid ?? inv.total ?? 0) / 100,
      moeda: (inv.currency || 'brl').toUpperCase(),
      status: inv.status, // paid | open | void | uncollectible | draft
      pdf: inv.invoice_pdf,
      link: inv.hosted_invoice_url,
    }))
    return NextResponse.json({ faturas })
  } catch (e) {
    console.error('[stripe/faturas] erro ao listar invoices:', e)
    return NextResponse.json({ error: 'Não foi possível carregar as faturas.' }, { status: 500 })
  }
}
