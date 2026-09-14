import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '../../../lib/supabase-admin'
import { supabaseDaRota, usuarioDaRota } from '../../../lib/rotaSupabase'
import { rateLimit } from '../../../lib/rate-limit'
import {
  liberarEntregador, liberarFesta, CAMPOS_PEDIDO_EM_ROTA,
  type LojaEntrega, type PedidoEmRota,
} from '../../../lib/entregaConfirmacao'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// LIBERAR PARA OUTRO ENTREGADOR — botão do comerciante.
//
// Só existe DEPOIS que a confirmação foi pedida (o GPS parou de subir e o
// entregador não respondeu ainda). Antes disso não há botão: tirar a corrida de
// alguém com GPS normal seria arbitrário, e o 409 aqui é a garantia disso mesmo
// que alguém chame a rota na mão.
//
// FESTA: a oferta é por `festa_id` e atribui todos os pedidos de uma vez, então
// libera a festa inteira e reoferta por `ofertarFesta` — soltar um pedido só
// deixaria o mesmo endereço dividido entre dois entregadores.
export async function POST(request: NextRequest) {
  const supabase = await supabaseDaRota()
  const user = await usuarioDaRota(supabase)
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (!rateLimit(`liberar-entregador:${user.id}`, 20, 60_000)) {
    return NextResponse.json({ error: 'Muitas tentativas. Aguarde.' }, { status: 429 })
  }

  const { pedido_id } = await request.json().catch(() => ({}))
  if (!pedido_id) return NextResponse.json({ error: 'pedido_id obrigatório' }, { status: 400 })

  const admin = createAdminClient()
  const { data: pedidoRow } = await admin
    .from('pedidos_clientes').select(CAMPOS_PEDIDO_EM_ROTA).eq('id', pedido_id).maybeSingle()
  const pedido = pedidoRow as unknown as PedidoEmRota | null
  if (!pedido) return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 })

  // Só o dono da loja do pedido.
  const { data: lojaRow } = await admin
    .from('lojas').select('id, user_id, nome, latitude, longitude').eq('id', pedido.loja_id).maybeSingle()
  const loja = lojaRow as LojaEntrega | null
  if (!loja || loja.user_id !== user.id) {
    return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 })
  }

  if (!pedido.entregador_id) {
    return NextResponse.json({ error: 'Este pedido já está sem entregador.' }, { status: 409 })
  }
  if (pedido.status !== 'saiu') {
    return NextResponse.json({ error: 'Só é possível liberar um pedido que já saiu para entrega.' }, { status: 409 })
  }
  // O portão: sem confirmação pendente, o entregador está com o GPS normal.
  if (!pedido.entrega_confirmacao_pedida_em) {
    return NextResponse.json(
      { error: 'O entregador está com a localização em dia. Aguarde o aviso de "sem sinal" para liberar.' },
      { status: 409 },
    )
  }

  try {
    const r = pedido.festa_id
      ? await liberarFesta(admin, pedido, loja)
      : await liberarEntregador(admin, pedido, loja, 'loja')
    return NextResponse.json({ ok: true, estado: r.estado, redispatch: r.redispatch })
  } catch (e) {
    console.error('[liberar-entregador] erro:', e)
    return NextResponse.json({ error: 'Erro ao liberar o pedido.' }, { status: 500 })
  }
}
