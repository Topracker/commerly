import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '../../../lib/supabase-admin'
import { rateLimit } from '../../../lib/rate-limit'
import {
  MAX_ENTREGAS_SIMULTANEAS, melhorRota, ordensDaRota, podemSerAgrupados, type PedidoRota,
} from '../../../lib/rota'

const ATIVOS = ['recebido', 'preparando', 'saiu']

/**
 * Multi-entrega: o entregador que já tem 1 pedido em andamento pega um segundo,
 * de uma loja próxima e com entrega na mesma direção, na mesma viagem.
 *
 * Grava os dois no mesmo `lote_entrega_id` e a ordem otimizada da rota
 * (loja1 → loja2 → cliente1 → cliente2, ou a variante mais curta).
 *
 * Body: { pedido_id }  — o pedido NOVO, que ainda não tem entregador.
 */
export async function POST(request: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } },
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (!rateLimit(`entregador-aceitar-junto:${user.id}`, 20, 60_000)) {
    return NextResponse.json({ error: 'Muitas tentativas. Aguarde.' }, { status: 429 })
  }

  const { pedido_id } = await request.json().catch(() => ({}))
  if (!pedido_id) return NextResponse.json({ error: 'pedido_id obrigatório' }, { status: 400 })

  const admin = createAdminClient()

  const { data: entregador } = await admin
    .from('entregadores').select('id, latitude, longitude').eq('user_id', user.id).single()
  if (!entregador) return NextResponse.json({ error: 'Perfil de entregador não encontrado' }, { status: 403 })

  // Pedido em andamento que ele já carrega. Precisa ser exatamente 1: com 0
  // usa-se /aceitar-pedido; com 2 já bateu o limite.
  const { data: ativos } = await admin
    .from('pedidos_clientes')
    .select('id, loja_id, entrega_latitude, entrega_longitude, lote_entrega_id')
    .eq('entregador_id', entregador.id).in('status', ATIVOS)

  const emAndamento = ativos || []
  if (emAndamento.length === 0) {
    return NextResponse.json({ error: 'Você não tem uma entrega em andamento para agrupar.' }, { status: 400 })
  }
  if (emAndamento.length >= MAX_ENTREGAS_SIMULTANEAS) {
    return NextResponse.json(
      { error: `Você já está com ${MAX_ENTREGAS_SIMULTANEAS} entregas. Conclua uma antes de aceitar outra.` },
      { status: 409 },
    )
  }

  const atual = emAndamento[0]
  if (atual.lote_entrega_id) {
    return NextResponse.json({ error: 'Sua entrega atual já faz parte de um lote.' }, { status: 409 })
  }

  const { data: candidato } = await admin
    .from('pedidos_clientes')
    .select('id, loja_id, entregador_id, status, entrega_latitude, entrega_longitude, lote_entrega_id')
    .eq('id', pedido_id).single()

  if (!candidato) return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 })
  if (candidato.id === atual.id) return NextResponse.json({ error: 'É o mesmo pedido.' }, { status: 400 })
  if (candidato.entregador_id) return NextResponse.json({ error: 'Pedido já foi aceito por outro entregador.' }, { status: 409 })
  if (candidato.lote_entrega_id) return NextResponse.json({ error: 'Pedido já está em um lote.' }, { status: 409 })
  if (!ATIVOS.includes(candidato.status)) {
    return NextResponse.json({ error: 'Pedido não está mais disponível.' }, { status: 409 })
  }

  // Parceria aceita com a loja do pedido novo (a da atual já foi validada).
  const { data: parceria } = await admin
    .from('entregador_parcerias').select('id')
    .eq('entregador_id', entregador.id).eq('loja_id', candidato.loja_id).eq('status', 'aceita').maybeSingle()
  if (!parceria) return NextResponse.json({ error: 'Você não é parceiro desta loja.' }, { status: 403 })

  // Coordenadas das duas lojas.
  const { data: lojas } = await admin
    .from('lojas').select('id, latitude, longitude').in('id', [atual.loja_id, candidato.loja_id])
  const coordLoja = new Map((lojas || []).map(l => [l.id, { latitude: l.latitude, longitude: l.longitude }]))

  const rotaAtual: PedidoRota = {
    id: atual.id,
    loja: coordLoja.get(atual.loja_id) ?? {},
    entrega: { latitude: atual.entrega_latitude, longitude: atual.entrega_longitude },
  }
  const rotaCandidato: PedidoRota = {
    id: candidato.id,
    loja: coordLoja.get(candidato.loja_id) ?? {},
    entrega: { latitude: candidato.entrega_latitude, longitude: candidato.entrega_longitude },
  }

  if (!podemSerAgrupados(rotaAtual, rotaCandidato)) {
    return NextResponse.json(
      { error: 'Este pedido está fora da sua rota atual (loja ou entrega muito distantes).' },
      { status: 409 },
    )
  }

  // A rota parte de onde o entregador está; sem GPS, parte da loja atual.
  const origem = entregador.latitude != null && entregador.longitude != null
    ? { latitude: entregador.latitude, longitude: entregador.longitude }
    : rotaAtual.loja

  const rota = melhorRota(origem, rotaAtual, rotaCandidato)
  if (!rota) {
    return NextResponse.json({ error: 'Não foi possível calcular a rota (faltam coordenadas).' }, { status: 409 })
  }

  // Reivindica o pedido novo de forma atômica: só se ainda estiver livre.
  const { data: claim, error: claimErr } = await admin
    .from('pedidos_clientes').update({ entregador_id: entregador.id })
    .eq('id', candidato.id).is('entregador_id', null).select('id')
  if (claimErr) return NextResponse.json({ error: 'Erro ao aceitar o pedido.' }, { status: 500 })
  if (!claim || claim.length === 0) {
    return NextResponse.json({ error: 'Pedido já foi aceito.' }, { status: 409 })
  }

  // Monta o lote. Se algo falhar aqui, desfazemos o claim — senão o entregador
  // fica com um pedido órfão, fora de lote e fora do pool.
  const loteId = crypto.randomUUID()
  const ordens = ordensDaRota(rota)

  const gravou = await Promise.all(
    [atual.id, candidato.id].map(id =>
      admin.from('pedidos_clientes').update({
        lote_entrega_id: loteId,
        ordem_coleta: ordens[id].coleta,
        ordem_entrega: ordens[id].entrega,
      }).eq('id', id),
    ),
  )

  const falhou = gravou.find(r => r.error)
  if (falhou) {
    console.error('[aceitar-junto] falha ao montar o lote:', falhou.error)
    await admin.from('pedidos_clientes')
      .update({ entregador_id: null, lote_entrega_id: null, ordem_coleta: null, ordem_entrega: null })
      .eq('id', candidato.id)
    await admin.from('pedidos_clientes')
      .update({ lote_entrega_id: null, ordem_coleta: null, ordem_entrega: null })
      .eq('id', atual.id)
    return NextResponse.json({ error: 'Erro ao montar a rota. Tente de novo.' }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    lote_entrega_id: loteId,
    distancia_km: rota.distanciaKm,
    paradas: rota.paradas.map(p => ({ pedido_id: p.pedidoId, tipo: p.tipo })),
  })
}
