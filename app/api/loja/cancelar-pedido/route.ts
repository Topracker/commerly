import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import Stripe from 'stripe'
import { createAdminClient } from '../../../lib/supabase-admin'
import { rateLimit } from '../../../lib/rate-limit'
import { dispatchPushPedido } from '../../../lib/pushDispatch'
import { pedidoEmAndamento, type StatusPedidoCliente } from '../../../lib/pedidosClientes'

// A LOJA cancela um pedido em andamento. Se foi pago online via Stripe, faz o
// estorno total ANTES de cancelar (revertendo também a transferência do
// subtotal para a conta Connect da loja). Espelha /api/cliente/cancelar-pedido.
//
// Auditoria 2026-09-11, achado V1: até aqui o painel fazia
// `update({ status: 'cancelado' })` direto pela chave anon e o dinheiro do
// cliente ficava com a loja. Agora:
//   * ESTE é o único caminho de cancelamento do painel (pago ou não);
//   * o guard `pedidos_clientes_guard` recusa `cancelado` em pedido pago
//     online vindo da role `authenticated` — só service_role passa, ou seja,
//     só esta rota e a do cliente, que estornam primeiro.
//
// Roda com service role: também ignora a policy restritiva `paywall_plano`,
// então uma loja com plano vencido CONSEGUE cancelar e estornar (é obrigação
// com o cliente, não feature). Por isso a rota está em APIS_SEM_PAYWALL no
// proxy.ts.
export async function POST(request: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } },
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (!rateLimit(`loja-cancelar-pedido:${user.id}`, 20, 60_000)) {
    return NextResponse.json({ error: 'Muitas tentativas. Aguarde.' }, { status: 429 })
  }

  const { pedido_id } = await request.json().catch(() => ({}))
  if (!pedido_id) return NextResponse.json({ error: 'pedido_id obrigatório' }, { status: 400 })

  const admin = createAdminClient()

  const { data: loja } = await admin.from('lojas').select('id').eq('user_id', user.id).maybeSingle()
  if (!loja) return NextResponse.json({ error: 'Loja não encontrada.' }, { status: 403 })

  const { data: pedido } = await admin
    .from('pedidos_clientes')
    .select('id, loja_id, status, total, pagamento_metodo, pagamento_status, stripe_payment_intent')
    .eq('id', pedido_id).maybeSingle()
  if (!pedido) return NextResponse.json({ error: 'Pedido não encontrado.' }, { status: 404 })
  if (pedido.loja_id !== loja.id) return NextResponse.json({ error: 'Este pedido não é da sua loja.' }, { status: 403 })

  const statusAtual = pedido.status as StatusPedidoCliente
  if (!pedidoEmAndamento(statusAtual)) {
    return NextResponse.json({ error: 'Este pedido já foi encerrado.' }, { status: 409 })
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
          metadata: { pedido_id: pedido.id, origem: 'loja' },
        },
        // Um refund por pedido, mesmo que a requisição seja repetida (retry de
        // rede, duplo clique): a Stripe devolve o mesmo refund em vez de
        // criar outro.
        { idempotencyKey: `refund-pedido-${pedido.id}` },
      )
      refundId = refund.id
      estornado = true
    } catch (e) {
      console.error('[loja/cancelar-pedido] erro no estorno:', e)
      // Conta Connect é `standard`: se o subtotal já foi sacado pela loja, a
      // Stripe não consegue reverter o transfer (balance_insufficient). Não
      // cancelamos o pedido — o estorno é resolvido manualmente no painel da
      // Stripe e só depois o pedido é cancelado.
      const code = (e as { code?: string } | null)?.code
      if (code === 'balance_insufficient') {
        return NextResponse.json({
          error: 'A Stripe não conseguiu reverter o repasse — o valor já foi sacado pela loja. ' +
            'Estorne manualmente no painel da Stripe e depois cancele o pedido.',
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
    .eq('status', statusAtual) // idempotente: não cancela se já mudou de status
    .select('id')
  if (updErr || !atualizado?.length) {
    console.error('[loja/cancelar-pedido] erro ao cancelar:', updErr?.message ?? 'nenhuma linha')
    // O estorno pode já ter saído (idempotente: repetir a chamada não estorna de novo).
    return NextResponse.json({ error: 'O pedido não pôde ser cancelado. Tente novamente ou fale com o suporte.' }, { status: 500 })
  }

  // Push do novo status (o trigger já gravou a notificação in-app do cliente).
  await dispatchPushPedido(admin, pedido.id)

  return NextResponse.json({ ok: true, estornado, valor: estornado ? Number(pedido.total) : 0 })
}
