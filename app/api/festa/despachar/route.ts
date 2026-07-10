import { NextRequest, NextResponse } from 'next/server'
import { autenticarCliente, bodyDe } from '../_lib'
import { rateLimit } from '../../../lib/rate-limit'
import { ofertarFesta } from '../../../lib/festaDispatch'

// O criador toca "Buscar entregador" numa festa já fechada e ainda sem
// entregador (ninguém estava online no fechamento, ou o anterior recusou).
export async function POST(request: NextRequest) {
  const auth = await autenticarCliente()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { admin, cliente } = auth.ctx

  if (!rateLimit(`festa-despachar:${cliente.id}`, 30, 60_000)) {
    return NextResponse.json({ error: 'Muitas tentativas. Aguarde.' }, { status: 429 })
  }

  const festaId = String((await bodyDe(request))?.festa_id || '')
  if (!festaId) return NextResponse.json({ error: 'festa_id obrigatório' }, { status: 400 })

  const { data: festa } = await admin.from('festas').select('id, status, criador_cliente_id').eq('id', festaId).maybeSingle()
  if (!festa) return NextResponse.json({ error: 'Festa não encontrada.' }, { status: 404 })
  if (festa.criador_cliente_id !== cliente.id) {
    return NextResponse.json({ error: 'Só o criador pode buscar o entregador.' }, { status: 403 })
  }
  if (festa.status !== 'fechada') {
    return NextResponse.json({ error: 'A festa precisa estar fechada para buscar entregador.' }, { status: 409 })
  }

  // Já tem entregador atribuído? (algum pedido da festa com entregador)
  const { data: comEntregador } = await admin
    .from('pedidos_clientes').select('id').eq('festa_id', festaId).not('entregador_id', 'is', null).limit(1)
  if (comEntregador && comEntregador.length > 0) {
    return NextResponse.json({ atribuido: true })
  }

  try {
    const r = await ofertarFesta(admin, festaId)
    if (r.tipo === 'sem_localizacao') return NextResponse.json({ error: 'As lojas da festa não têm localização.' }, { status: 400 })
    if (r.tipo === 'sem_pedidos') return NextResponse.json({ error: 'Esta festa não tem pedidos.' }, { status: 400 })
    if (r.tipo === 'esgotado') return NextResponse.json({ esgotado: true, tentativas: r.tentativas })
    if (r.tipo === 'esperando') return NextResponse.json({ esperando: true, entregador: r.entregador })
    return NextResponse.json({ oferta: r.oferta, entregador: r.entregador })
  } catch (e) {
    console.error('[festa/despachar] erro:', e)
    return NextResponse.json({ error: 'Erro ao buscar entregador.' }, { status: 500 })
  }
}
