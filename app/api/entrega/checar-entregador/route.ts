import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '../../../lib/supabase-admin'
import { rateLimit } from '../../../lib/rate-limit'
import { rodarWatchdog } from '../../../lib/despachoWatchdog'
import {
  avaliarEntregaEmRota, CAMPOS_PEDIDO_EM_ROTA,
  type LojaEntrega, type PedidoEmRota,
} from '../../../lib/entregaConfirmacao'

// ENTREGADOR SUMIDO EM ROTA: se o entregador saiu para entrega e o GPS parou de
// subir, NAO liberamos mais o pedido em silencio — abrimos uma CONFIRMACAO
// PENDENTE (pergunta a ele + alerta a loja) e so liberamos se ele nao responder
// nem voltar a mandar posicao. Toda a decisao mora em lib/entregaConfirmacao.ts.
// Chamado pelo acompanhamento do cliente (poll) e pelo painel da loja. Roda com
// service role; o chamador so pede a passada, nunca escolhe liberar.
export async function POST(request: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } },
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (!rateLimit(`checar-entregador:${user.id}`, 120, 60_000)) {
    return NextResponse.json({ error: 'Muitas tentativas. Aguarde.' }, { status: 429 })
  }

  const { pedido_id } = await request.json().catch(() => ({}))
  if (!pedido_id) return NextResponse.json({ error: 'pedido_id obrigatório' }, { status: 400 })

  const admin = createAdminClient()
  const { data: pedidoRow } = await admin
    .from('pedidos_clientes')
    .select(CAMPOS_PEDIDO_EM_ROTA)
    .eq('id', pedido_id).single()
  const pedido = pedidoRow as unknown as PedidoEmRota | null
  if (!pedido) return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 })

  // Autorizacao: cliente do pedido ou dono da loja.
  const { data: loja } = await admin
    .from('lojas').select('id, user_id, nome, latitude, longitude').eq('id', pedido.loja_id).single()
  const { data: cliente } = pedido.cliente_id
    ? await admin.from('clientes').select('user_id').eq('id', pedido.cliente_id).maybeSingle()
    : { data: null as any }
  const autorizado = loja?.user_id === user.id || (cliente as any)?.user_id === user.id
  if (!autorizado) return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 })

  // Pedido ainda sem entregador: aproveita esta chamada para dar uma passada do
  // WATCHDOG DE DESPACHO nele. O plano Hobby da Vercel só aceita cron diário,
  // então a cadeia de ofertas precisa de gatilhos vindos do app — e esta rota é
  // justamente a que a tela de acompanhamento do CLIENTE fica chamando. Ou
  // seja: enquanto alguém estiver esperando o pedido, a busca continua andando
  // mesmo com o painel do comerciante fechado.
  if (!pedido.entregador_id) {
    try {
      await rodarWatchdog(admin, undefined, pedido_id)
    } catch (e) {
      console.error('[checar-entregador] watchdog falhou:', e)
    }
    return NextResponse.json({ ok: true, estado: 'ok', prazo_em: null, liberado: false })
  }

  // So monitora entregas em rota (o GPS so roda quando status = 'saiu').
  if (pedido.status !== 'saiu' || !loja) {
    return NextResponse.json({ ok: true, estado: 'ok', prazo_em: null, liberado: false })
  }

  // Uma passada da maquina de estados (pergunta -> espera -> libera).
  try {
    const r = await avaliarEntregaEmRota(admin, pedido, loja as LojaEntrega)
    return NextResponse.json({
      ok: true,
      estado: r.estado,
      prazo_em: r.prazo_em,
      redispatch: r.redispatch,
      // `liberado` fica por compatibilidade: uma aba antiga aberta durante o
      // deploy continua lendo este campo e nao quebra.
      liberado: r.estado === 'liberado',
    })
  } catch (e) {
    console.error('[checar-entregador] avaliacao falhou:', e)
    return NextResponse.json({ error: 'Erro ao checar a entrega.' }, { status: 500 })
  }
}
