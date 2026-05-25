import { NextRequest, NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { createAdminClient } from '../../../lib/supabase-admin'
import { getStripe } from '../../../lib/stripe'

export async function POST(request: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!webhookSecret) {
    console.error('[stripe webhook] STRIPE_WEBHOOK_SECRET não configurada')
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 })
  }

  const rawBody = await request.text()
  const signature = request.headers.get('stripe-signature') ?? ''

  let event: Stripe.Event
  try {
    event = getStripe().webhooks.constructEvent(rawBody, signature, webhookSecret)
  } catch (err) {
    console.error('[stripe webhook] assinatura inválida:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const supabase = createAdminClient()

  switch (event.type) {
    // Pagamento confirmado no checkout — ativa o plano
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      const lojaId = session.client_reference_id || session.metadata?.loja_id
      const subscriptionId = typeof session.subscription === 'string'
        ? session.subscription
        : session.subscription?.id

      if (!lojaId || !subscriptionId) {
        console.error('[stripe webhook] checkout sem loja_id/subscription', { lojaId, subscriptionId })
        break
      }

      await supabase
        .from('lojas')
        .update({ plano: 'ativo', stripe_subscription_id: subscriptionId })
        .eq('id', lojaId)

      console.log('[stripe webhook] plano ativado:', { lojaId, subscriptionId })
      break
    }

    // Assinatura encerrada (cancelamento ou falha de cobrança) — desativa o plano
    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription
      const lojaId = subscription.metadata?.loja_id

      const query = supabase
        .from('lojas')
        .update({ plano: 'inativo', stripe_subscription_id: null })

      // Prefere o loja_id do metadata; cai para o subscription_id se ausente
      const { error } = lojaId
        ? await query.eq('id', lojaId)
        : await query.eq('stripe_subscription_id', subscription.id)

      if (error) console.error('[stripe webhook] erro ao desativar plano:', error)
      else console.log('[stripe webhook] plano desativado:', subscription.id)
      break
    }

    default:
      // Demais eventos são ignorados silenciosamente
      break
  }

  return NextResponse.json({ received: true })
}
