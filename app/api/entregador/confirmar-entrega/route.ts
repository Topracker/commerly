import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import Stripe from 'stripe'
import { createAdminClient } from '../../../lib/supabase-admin'
import { rateLimit } from '../../../lib/rate-limit'

// Entregador digita o código de 4 dígitos do cliente para confirmar a entrega.
// Confere o código, marca o pedido como 'entregue' e paga a corrida via
// Stripe Connect (transfer para a conta do entregador).
export async function POST(request: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } },
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (!rateLimit(`entregador-confirmar:${user.id}`, 20, 60_000)) {
    return NextResponse.json({ error: 'Muitas tentativas. Aguarde um instante.' }, { status: 429 })
  }

  const { pedido_id, codigo } = await request.json().catch(() => ({}))
  if (!pedido_id || !codigo) return NextResponse.json({ error: 'Informe o pedido e o código.' }, { status: 400 })

  const admin = createAdminClient()
  const { data: entregador } = await admin
    .from('entregadores').select('id, stripe_account_id, stripe_onboarded').eq('user_id', user.id).single()
  if (!entregador) return NextResponse.json({ error: 'Perfil de entregador não encontrado' }, { status: 403 })

  const { data: pedido } = await admin
    .from('pedidos_clientes')
    .select('id, entregador_id, status, codigo_confirmacao, valor_corrida, pagamento_corrida')
    .eq('id', pedido_id).single()
  if (!pedido) return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 })
  if (pedido.entregador_id !== entregador.id) return NextResponse.json({ error: 'Este pedido não é seu.' }, { status: 403 })
  if (pedido.status === 'entregue') return NextResponse.json({ ok: true, already: true })
  if (!pedido.codigo_confirmacao) return NextResponse.json({ error: 'Este pedido ainda não saiu para entrega.' }, { status: 409 })
  if (String(codigo).trim() !== pedido.codigo_confirmacao) {
    return NextResponse.json({ error: 'Código incorreto. Confira com o cliente.' }, { status: 400 })
  }

  const { error: updErr } = await admin.from('pedidos_clientes').update({ status: 'entregue' }).eq('id', pedido_id)
  if (updErr) return NextResponse.json({ error: 'Erro ao confirmar a entrega.' }, { status: 500 })

  // Payout da corrida via Stripe Connect (best-effort — a entrega já foi
  // confirmada; se o transfer falhar, pagamento_corrida fica 'pendente').
  let pago = false
  const valor = Number(pedido.valor_corrida) || 0
  if (process.env.STRIPE_SECRET_KEY && entregador.stripe_account_id && entregador.stripe_onboarded && valor > 0) {
    try {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
      await stripe.transfers.create({
        amount: Math.round(valor * 100),
        currency: 'brl',
        destination: entregador.stripe_account_id,
        metadata: { pedido_id, entregador_id: entregador.id },
      })
      pago = true
      await admin.from('pedidos_clientes').update({ pagamento_corrida: 'pago' }).eq('id', pedido_id)
    } catch (e) {
      console.error('[entregador/confirmar-entrega] transfer falhou:', e)
    }
  }

  return NextResponse.json({ ok: true, pago, valor })
}
