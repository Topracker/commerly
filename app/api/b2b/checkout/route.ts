import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import Stripe from 'stripe'
import { createAdminClient } from '../../../lib/supabase-admin'
import { rateLimit } from '../../../lib/rate-limit'
import { COMISSAO_PCT, calcularComissao, comissaoEmCentavos, totalDosItens, type ItemPedidoB2B } from '../../../lib/b2b'

/**
 * Pagamento online de um pedido B2B (loja compra do fornecedor).
 *
 * Destination charge: o dinheiro cai na conta Connect do fornecedor e a
 * Commerly retém 5% via `application_fee_amount`. O pedido só é marcado como
 * pago no webhook (metadata.tipo='pedido_b2b').
 *
 * Body: { pedido_id }
 */
export async function POST(request: NextRequest) {
  const cookieStore = await cookies()
  const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } },
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 })

  if (!rateLimit(`b2b-checkout:${user.id}`, 10, 60_000)) {
    return NextResponse.json({ erro: 'Muitas requisições' }, { status: 429 })
  }
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ erro: 'Pagamento online indisponível' }, { status: 503 })
  }

  const body = await request.json().catch(() => null)
  const pedidoId: string = body?.pedido_id ?? ''
  if (!pedidoId) return NextResponse.json({ erro: 'pedido_id é obrigatório' }, { status: 400 })

  const { data: loja } = await supabase.from('lojas').select('id').eq('user_id', user.id).single()
  if (!loja) return NextResponse.json({ erro: 'Loja não encontrada' }, { status: 404 })

  const admin = createAdminClient()

  // O pedido tem que ser desta loja e ainda não estar pago.
  const { data: pedido } = await admin
    .from('pedidos')
    .select('id, loja_id, fornecedor_id, itens, total, pagamento_status')
    .eq('id', pedidoId).single()

  if (!pedido || pedido.loja_id !== loja.id) {
    return NextResponse.json({ erro: 'Pedido não encontrado' }, { status: 404 })
  }
  if (pedido.pagamento_status === 'pago') {
    return NextResponse.json({ erro: 'Este pedido já foi pago' }, { status: 400 })
  }

  const { data: fornecedor } = await admin
    .from('fornecedores').select('id, nome, stripe_account_id, stripe_onboarded')
    .eq('id', pedido.fornecedor_id).single()

  if (!fornecedor?.stripe_onboarded || !fornecedor.stripe_account_id) {
    return NextResponse.json(
      { erro: 'Este fornecedor ainda não ativou o recebimento online. Combine o pagamento direto com ele.' },
      { status: 400 },
    )
  }

  // Recalcula o total a partir dos itens: nunca confiar no `total` gravado.
  const itens = (Array.isArray(pedido.itens) ? pedido.itens : []) as ItemPedidoB2B[]
  if (itens.length === 0) return NextResponse.json({ erro: 'Pedido sem itens' }, { status: 400 })

  const total = totalDosItens(itens)
  if (total <= 0) return NextResponse.json({ erro: 'Total inválido' }, { status: 400 })

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: itens.map(i => ({
        quantity: i.quantidade,
        price_data: {
          currency: 'brl',
          unit_amount: Math.round(i.preco * 100),
          product_data: { name: i.nome },
        },
      })),
      payment_intent_data: {
        application_fee_amount: comissaoEmCentavos(total),
        transfer_data: { destination: fornecedor.stripe_account_id },
        metadata: { tipo: 'pedido_b2b', pedido_id: pedido.id },
      },
      success_url: `${origin}/fornecedor/${fornecedor.id}?pagamento=sucesso`,
      cancel_url: `${origin}/fornecedor/${fornecedor.id}?pagamento=cancelado`,
      metadata: { tipo: 'pedido_b2b', pedido_id: pedido.id },
    })

    if (!session.url) return NextResponse.json({ erro: 'Falha ao criar o checkout' }, { status: 502 })

    await admin.from('pedidos').update({
      stripe_session_id: session.id,
      comissao: calcularComissao(total),
      pagamento_metodo: 'online',
    }).eq('id', pedido.id)

    return NextResponse.json({ url: session.url, comissao_pct: COMISSAO_PCT })
  } catch (e) {
    console.error('[b2b/checkout] erro no Stripe:', e)
    return NextResponse.json({ erro: 'Falha ao iniciar o pagamento' }, { status: 502 })
  }
}
