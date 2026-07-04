import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createAdminClient } from '../../../lib/supabase-admin'
import { dispatchPushPedido } from '../../../lib/pushDispatch'

export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_SECRET_KEY
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret || !webhookSecret) {
    console.error('[stripe/webhook] Stripe não configurada')
    return NextResponse.json({ ok: false }, { status: 500 })
  }

  const stripe = new Stripe(secret)
  const signature = request.headers.get('stripe-signature') ?? ''
  const rawBody = await request.text()

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret)
  } catch (e) {
    console.error('[stripe/webhook] assinatura inválida:', e)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const supabase = createAdminClient()

  // --- Pagamento ONLINE de um pedido de delivery -> cria o pedido real. -----
  // "O pedido só é criado após o pagamento confirmado": aqui movemos o pedido
  // pendente para pedidos_clientes (o que também dispara a notificação da loja).
  //
  // Cartão confirma na hora (`checkout.session.completed`, payment_status=paid).
  // Pix é ASSÍNCRONO: o `completed` chega com payment_status=unpaid (cliente
  // ainda vai escanear o QR) e a confirmação vem depois em
  // `async_payment_succeeded`. Tratamos os dois; o teste de payment_status
  // abaixo garante que o pedido só nasce quando de fato está pago.
  if (
    (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded')
    && (event.data.object as any).metadata?.tipo === 'pedido_online'
  ) {
    const session = event.data.object as Stripe.Checkout.Session
    if (session.payment_status !== 'paid') return NextResponse.json({ ok: true })

    const pendenteId = session.metadata?.pendente_id
    if (!pendenteId) return NextResponse.json({ ok: true })

    const { data: pend } = await supabase.from('pedidos_pendentes').select('*').eq('id', pendenteId).single()
    if (!pend) return NextResponse.json({ ok: true }) // já processado ou inexistente

    const paymentIntent = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id

    const { data: novoPedido, error: insErr } = await supabase.from('pedidos_clientes').insert({
      loja_id: pend.loja_id,
      cliente_id: pend.cliente_id,
      itens: pend.itens,
      total: pend.total,               // recalculado pelo guard (bate com o cobrado)
      taxa_entrega: pend.taxa_entrega,
      endereco_entrega: pend.endereco_entrega,
      entrega_latitude: pend.entrega_latitude,
      entrega_longitude: pend.entrega_longitude,
      observacao: pend.observacao,
      cliente_nome: pend.cliente_nome,
      cliente_telefone: pend.cliente_telefone,
      // Resgate de pontos: o guard reaplica o mesmo desconto (determinístico a
      // partir de pontos_usados) e o trigger de acúmulo debita/credita o saldo.
      pontos_usados: pend.pontos_usados || 0,
      pagamento_metodo: 'online',
      pagamento_status: 'pago',
      stripe_session_id: session.id,
      stripe_payment_intent: paymentIntent,
    }).select('id').single()
    if (insErr || !novoPedido) {
      console.error('[stripe/webhook] erro ao criar pedido pago:', insErr?.message)
      return NextResponse.json({ ok: false }, { status: 500 }) // Stripe re-tenta
    }
    await supabase.from('pedidos_pendentes').delete().eq('id', pendenteId)
    // Push nativo para o comerciante (o trigger já gravou a notificação in-app).
    await dispatchPushPedido(supabase, novoPedido.id)
    return NextResponse.json({ ok: true })
  }

  // Pix expirou ou falhou -> descarta o pedido pendente (não vira pedido real).
  if (event.type === 'checkout.session.async_payment_failed' && (event.data.object as any).metadata?.tipo === 'pedido_online') {
    const session = event.data.object as Stripe.Checkout.Session
    const pendenteId = session.metadata?.pendente_id
    if (pendenteId) await supabase.from('pedidos_pendentes').delete().eq('id', pendenteId)
    return NextResponse.json({ ok: true })
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    const lojaId = session.client_reference_id || session.metadata?.loja_id
    const subscriptionId = typeof session.subscription === 'string'
      ? session.subscription
      : session.subscription?.id

    if (!lojaId || !subscriptionId) return NextResponse.json({ ok: true })
    if (session.payment_status !== 'paid') return NextResponse.json({ ok: true })

    await supabase
      .from('lojas')
      .update({ plano: 'ativo', stripe_subscription_id: subscriptionId })
      .eq('id', lojaId)

    return NextResponse.json({ ok: true })
  }

  if (event.type === 'invoice.paid') {
    const invoice = event.data.object as Stripe.Invoice
    const subscriptionId = typeof (invoice as any).subscription === 'string'
      ? (invoice as any).subscription
      : (invoice as any).subscription?.id
    if (!subscriptionId) return NextResponse.json({ ok: true })

    await supabase
      .from('lojas')
      .update({ plano: 'ativo' })
      .eq('stripe_subscription_id', subscriptionId)

    return NextResponse.json({ ok: true })
  }

  if (event.type === 'customer.subscription.deleted') {
    const sub = event.data.object as Stripe.Subscription
    await supabase
      .from('lojas')
      .update({ plano: 'inativo', stripe_subscription_id: null })
      .eq('stripe_subscription_id', sub.id)

    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ ok: true })
}
