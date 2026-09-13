import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import Stripe from 'stripe'
import { createAdminClient } from '../../../lib/supabase-admin'
import { rateLimit } from '../../../lib/rate-limit'
import { dispatchPushPedido } from '../../../lib/pushDispatch'

// Cliente cancela o próprio pedido enquanto ainda está em "recebido" (a loja
// nem começou a preparar). Se foi pago online via Stripe, faz o estorno total
// automaticamente (revertendo também a transferência para a conta da loja).
//
// Roda com service role: o cliente não tem policy de UPDATE em pedidos_clientes,
// e o estorno precisa acontecer no servidor com a chave secreta.
export async function POST(request: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } },
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (!rateLimit(`cancelar-pedido:${user.id}`, 20, 60_000)) {
    return NextResponse.json({ error: 'Muitas tentativas. Aguarde.' }, { status: 429 })
  }

  const { pedido_id } = await request.json().catch(() => ({}))
  if (!pedido_id) return NextResponse.json({ error: 'pedido_id obrigatório' }, { status: 400 })

  const admin = createAdminClient()

  const { data: cliente } = await admin.from('clientes').select('id').eq('user_id', user.id).single()
  if (!cliente) return NextResponse.json({ error: 'Perfil de cliente não encontrado.' }, { status: 403 })

  const { data: pedido } = await admin
    .from('pedidos_clientes')
    .select('id, cliente_id, status, pagamento_metodo, pagamento_status, stripe_payment_intent')
    .eq('id', pedido_id).single()
  if (!pedido) return NextResponse.json({ error: 'Pedido não encontrado.' }, { status: 404 })
  if (pedido.cliente_id !== cliente.id) return NextResponse.json({ error: 'Este pedido não é seu.' }, { status: 403 })
  // Só dá pra cancelar antes de a loja começar a preparar.
  if (pedido.status !== 'recebido') {
    return NextResponse.json({ error: 'Este pedido não pode mais ser cancelado — a loja já começou a prepará-lo.' }, { status: 409 })
  }

  // Pagamento online já efetivado -> estorno total antes de cancelar.
  let estornado = false
  let refundId: string | null = null
  const pagoOnline = pedido.pagamento_metodo === 'online' && pedido.pagamento_status === 'pago'
  if (pagoOnline) {
    if (!process.env.STRIPE_SECRET_KEY || !pedido.stripe_payment_intent) {
      return NextResponse.json({
        error: 'Não foi possível localizar o pagamento para estorno. Fale com o suporte.',
      }, { status: 409 })
    }
    try {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
      const refund = await stripe.refunds.create(
        {
          payment_intent: pedido.stripe_payment_intent,
          // Destination charge: reverte também a parte transferida para a loja.
          reverse_transfer: true,
          metadata: { pedido_id: pedido.id, origem: 'cliente' },
        },
        // Um refund por pedido, mesmo repetindo a requisição (V1): a mesma
        // chave que /api/loja/cancelar-pedido usa — quem estornar primeiro vale.
        { idempotencyKey: `refund-pedido-${pedido.id}` },
      )
      refundId = refund.id
      estornado = true
    } catch (e) {
      console.error('[cancelar-pedido] erro no estorno:', e)
      // Conta Connect `standard` com o subtotal já sacado pela loja: a Stripe
      // não reverte o transfer. Não cancela — resolve-se manualmente na Stripe.
      const code = (e as { code?: string } | null)?.code
      if (code === 'balance_insufficient') {
        return NextResponse.json({
          error: 'O estorno precisa ser feito manualmente pela loja. Fale com o suporte.',
          code,
        }, { status: 409 })
      }
      return NextResponse.json({ error: 'Não foi possível estornar o pagamento agora. Tente de novo em instantes.' }, { status: 502 })
    }
  }

  const { data: atualizado, error: updErr } = await admin
    .from('pedidos_clientes')
    .update({
      status: 'cancelado',
      ...(estornado ? { pagamento_status: 'estornado', estornado_em: new Date().toISOString(), stripe_refund_id: refundId } : {}),
    })
    .eq('id', pedido.id)
    .eq('status', 'recebido') // idempotente: não cancela se já mudou de status
    .select('id')
  if (updErr || !atualizado?.length) {
    console.error('[cancelar-pedido] erro ao cancelar:', updErr?.message ?? 'nenhuma linha')
    // O estorno pode já ter saído (idempotente: repetir não estorna de novo).
    return NextResponse.json({ error: 'O pedido não pôde ser cancelado. Fale com o suporte.' }, { status: 500 })
  }

  // Push do novo status (o trigger já gravou a notificação in-app do cliente).
  await dispatchPushPedido(admin, pedido.id)

  return NextResponse.json({ ok: true, estornado })
}
