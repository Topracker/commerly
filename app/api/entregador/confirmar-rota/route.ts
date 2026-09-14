import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '../../../lib/supabase-admin'
import { supabaseDaRota, usuarioDaRota } from '../../../lib/rotaSupabase'
import { rateLimit } from '../../../lib/rate-limit'
import {
  confirmarEntregaEmRota, CAMPOS_PEDIDO_EM_ROTA,
  type LojaEntrega, type PedidoEmRota,
} from '../../../lib/entregaConfirmacao'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// "AINDA ESTOU COM O PEDIDO" — resposta do entregador ao aviso de GPS parado.
//
// Precisa de service role: o entregador NÃO tem policy de UPDATE em
// `pedidos_clientes` (só existe `pedidos_loja_update_dono`), então pela chave
// anon ele jamais conseguiria limpar a própria pendência.
//
// Aceita a posição junto quando o navegador consegue dar — o GPS novo é o que
// de fato reinicia o relógio e evita a próxima pergunta.
export async function POST(request: NextRequest) {
  const supabase = await supabaseDaRota()
  const user = await usuarioDaRota(supabase)
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (!rateLimit(`confirmar-rota:${user.id}`, 30, 60_000)) {
    return NextResponse.json({ error: 'Muitas tentativas. Aguarde.' }, { status: 429 })
  }

  const { pedido_id, latitude, longitude } = await request.json().catch(() => ({}))
  if (!pedido_id) return NextResponse.json({ error: 'pedido_id obrigatório' }, { status: 400 })

  const admin = createAdminClient()
  const { data: entregador } = await admin
    .from('entregadores').select('id').eq('user_id', user.id).maybeSingle()
  if (!entregador) return NextResponse.json({ error: 'Perfil de entregador não encontrado' }, { status: 403 })

  const { data: pedidoRow } = await admin
    .from('pedidos_clientes').select(CAMPOS_PEDIDO_EM_ROTA).eq('id', pedido_id).maybeSingle()
  const pedido = pedidoRow as unknown as PedidoEmRota | null
  if (!pedido) return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 })

  // Já perdeu a corrida (o prazo venceu ou a loja liberou): 409 para a tela
  // poder dizer isso com todas as letras, em vez de fingir que confirmou.
  if (pedido.entregador_id !== entregador.id) {
    return NextResponse.json({ error: 'Esta corrida já foi repassada a outro entregador.' }, { status: 409 })
  }
  if (pedido.status !== 'saiu') {
    return NextResponse.json({ error: 'Este pedido não está em rota.' }, { status: 409 })
  }

  const { data: lojaRow } = await admin
    .from('lojas').select('id, user_id, nome, latitude, longitude').eq('id', pedido.loja_id).maybeSingle()
  const loja = lojaRow as LojaEntrega | null
  if (!loja) return NextResponse.json({ error: 'Loja não encontrada.' }, { status: 404 })

  // Posição junto com a confirmação (best-effort): vale mais que o clique.
  if (typeof latitude === 'number' && typeof longitude === 'number') {
    const { error: locErr } = await admin.from('entregas_localizacao').upsert({
      pedido_id, entregador_id: entregador.id,
      latitude, longitude, updated_at: new Date().toISOString(),
    })
    if (locErr) console.error('[confirmar-rota] upsert de posição falhou:', locErr.message)
  }

  const ok = await confirmarEntregaEmRota(admin, pedido, loja)
  if (!ok) return NextResponse.json({ error: 'Não foi possível confirmar. Recarregue a tela.' }, { status: 409 })

  return NextResponse.json({ ok: true })
}
