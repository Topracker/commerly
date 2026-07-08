import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '../../../lib/supabase-admin'
import { rateLimit } from '../../../lib/rate-limit'
import { ofertarProximoEntregador } from '../../../lib/dispatch'

// Despacho estilo Uber: o comerciante toca "Buscar entregador proximo" num
// pedido sem entregador. A oferta vai ao entregador Online mais proximo (raio de
// 5 km); se recusada/expirada, a proxima chamada oferta ao seguinte.
export async function POST(request: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } },
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (!rateLimit(`buscar-entregador:${user.id}`, 60, 60_000)) {
    return NextResponse.json({ error: 'Muitas tentativas. Aguarde.' }, { status: 429 })
  }

  const { pedido_id } = await request.json().catch(() => ({}))
  if (!pedido_id) return NextResponse.json({ error: 'pedido_id obrigatório' }, { status: 400 })

  const admin = createAdminClient()

  const { data: pedido } = await admin
    .from('pedidos_clientes').select('id, loja_id, entregador_id, status').eq('id', pedido_id).single()
  if (!pedido) return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 })

  const { data: loja } = await admin
    .from('lojas').select('id, user_id, latitude, longitude').eq('id', pedido.loja_id).single()
  if (!loja || loja.user_id !== user.id) {
    return NextResponse.json({ error: 'Sem permissão para este pedido.' }, { status: 403 })
  }
  if (pedido.entregador_id) return NextResponse.json({ atribuido: true })
  if (pedido.status === 'entregue' || pedido.status === 'cancelado') {
    return NextResponse.json({ error: 'Pedido não está mais disponível.' }, { status: 409 })
  }
  if (loja.latitude == null || loja.longitude == null) {
    return NextResponse.json({ error: 'Cadastre a localização da loja para buscar entregadores.' }, { status: 400 })
  }

  try {
    const r = await ofertarProximoEntregador(admin, pedido_id, loja)
    if (r.tipo === 'sem_localizacao') {
      return NextResponse.json({ error: 'Cadastre a localização da loja para buscar entregadores.' }, { status: 400 })
    }
    if (r.tipo === 'esgotado') return NextResponse.json({ esgotado: true, tentativas: r.tentativas })
    if (r.tipo === 'esperando') return NextResponse.json({ esperando: true, oferta: r.oferta, entregador: r.entregador })
    return NextResponse.json({ oferta: r.oferta, entregador: r.entregador })
  } catch (e) {
    console.error('[buscar-entregador] erro:', e)
    return NextResponse.json({ error: 'Erro ao ofertar a corrida.' }, { status: 500 })
  }
}
