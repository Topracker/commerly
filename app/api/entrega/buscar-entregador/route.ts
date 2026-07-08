import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '../../../lib/supabase-admin'
import { rateLimit } from '../../../lib/rate-limit'
import { dispatchPushOferta } from '../../../lib/pushDispatch'
import { distanciaKm } from '../../../lib/geo'
import { RAIO_BUSCA_KM, TEMPO_RESPOSTA_CORRIDA_S, FRESCOR_LOCALIZACAO_MS } from '../../../lib/entregadores'

// Despacho estilo Uber: o comerciante toca "Buscar entregador proximo" num
// pedido sem entregador. Buscamos entregadores Online (disponivel + posicao
// recente) num raio de 5 km da loja, ordenamos por distancia e OFERTAMOS a
// corrida ao mais proximo que ainda nao recebeu oferta deste pedido. A oferta
// vale 30s; se recusada/expirada, a proxima chamada oferta ao seguinte.
//
// Roda com service role: le a posicao dos entregadores (RLS owner-only) e cria
// a oferta de forma controlada. A leitura do pool nunca e exposta ao client.
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

  // Pedido + loja (o solicitante precisa ser o dono da loja do pedido).
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

  const agora = Date.now()

  // Expira ofertas pendentes vencidas deste pedido (nao bloqueiam o proximo).
  await admin.from('corrida_ofertas').update({ status: 'expirada' })
    .eq('pedido_id', pedido_id).eq('status', 'pendente').lt('expira_em', new Date(agora).toISOString())

  // Todas as ofertas ja feitas para este pedido (qualquer status).
  const { data: ofertasExistentes } = await admin
    .from('corrida_ofertas').select('id, entregador_id, status, expira_em, distancia_km')
    .eq('pedido_id', pedido_id)

  // Se ainda ha uma oferta pendente e valida, aguarda a resposta (nao duplica).
  const pendenteValida = (ofertasExistentes || []).find(
    o => o.status === 'pendente' && new Date(o.expira_em).getTime() > agora,
  )
  if (pendenteValida) {
    const { data: ent } = await admin.from('entregadores_publicos').select('nome').eq('id', pendenteValida.entregador_id).maybeSingle()
    return NextResponse.json({ esperando: true, oferta: pendenteValida, entregador: { nome: ent?.nome || 'Entregador' } })
  }

  const jaOfertados = new Set((ofertasExistentes || []).map(o => o.entregador_id))

  // Entregadores ocupados: com um pedido em andamento atribuido.
  const { data: ocupadosRows } = await admin
    .from('pedidos_clientes').select('entregador_id')
    .not('entregador_id', 'is', null).in('status', ['recebido', 'preparando', 'saiu'])
  const ocupados = new Set((ocupadosRows || []).map(r => r.entregador_id as string))

  // Pool: entregadores Online com posicao recente.
  const desde = new Date(agora - FRESCOR_LOCALIZACAO_MS).toISOString()
  const { data: pool } = await admin
    .from('entregadores')
    .select('id, nome, latitude, longitude, localizacao_at')
    .eq('disponivel', true)
    .not('latitude', 'is', null)
    .not('longitude', 'is', null)
    .gte('localizacao_at', desde)

  const candidatos = (pool || [])
    .filter(e => !jaOfertados.has(e.id) && !ocupados.has(e.id))
    .map(e => ({
      ...e,
      dist: distanciaKm(
        { latitude: loja.latitude, longitude: loja.longitude },
        { latitude: e.latitude, longitude: e.longitude },
      ),
    }))
    .filter(e => e.dist != null && e.dist <= RAIO_BUSCA_KM)
    .sort((a, b) => (a.dist! - b.dist!))

  if (candidatos.length === 0) {
    // Sem ninguem novo. Se ja tentamos alguem, e "esgotado"; senao, "vazio".
    return NextResponse.json({ esgotado: true, tentativas: jaOfertados.size })
  }

  const escolhido = candidatos[0]
  const distKm = Math.round((escolhido.dist as number) * 100) / 100
  const expira_em = new Date(agora + TEMPO_RESPOSTA_CORRIDA_S * 1000).toISOString()

  const { data: oferta, error } = await admin
    .from('corrida_ofertas')
    .insert({
      pedido_id, entregador_id: escolhido.id, loja_id: loja.id,
      status: 'pendente', distancia_km: distKm, expira_em,
    })
    .select('*').single()
  if (error || !oferta) {
    console.error('[buscar-entregador] erro ao criar oferta:', error?.message)
    return NextResponse.json({ error: 'Erro ao ofertar a corrida.' }, { status: 500 })
  }

  // Push nativo (a notificacao ja foi gravada pelo trigger da oferta).
  await dispatchPushOferta(admin, oferta.id)

  return NextResponse.json({
    oferta,
    entregador: { nome: escolhido.nome, distancia_km: distKm },
  })
}
