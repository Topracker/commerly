import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { distanciaKm } from './geo'
import { RAIO_BUSCA_KM, TEMPO_RESPOSTA_CORRIDA_S, FRESCOR_LOCALIZACAO_MS } from './entregadores'
import { FESTA_BONUS_PCT } from './festas'
import { dispatchPushOferta } from './pushDispatch'

// Despacho da FESTA. Diferente de lib/dispatch.ts (um pedido = uma corrida),
// aqui uma oferta cobre a festa inteira: o entregador passa nas lojas e entrega
// tudo num endereço só. A oferta aponta para `festa_id` (não `pedido_id`) e, ao
// ser aceita, todos os pedidos da festa vão para o mesmo entregador.
//
// Ponto de referência da busca: o CENTROIDE das lojas da festa (elas estão a até
// 2 km umas das outras, então o centro é uma boa âncora). `loja_id` da oferta
// recebe a loja mais próxima do centro — só para nomear a corrida na notificação.

export type ResultadoDespachoFesta =
  | { tipo: 'ofertado'; oferta: any; entregador: { nome: string; distancia_km: number } }
  | { tipo: 'esperando'; oferta: any; entregador: { nome: string } }
  | { tipo: 'esgotado'; tentativas: number }
  | { tipo: 'sem_pedidos' }
  | { tipo: 'sem_localizacao' }

export async function ofertarFesta(
  admin: SupabaseClient,
  festaId: string,
): Promise<ResultadoDespachoFesta> {
  const agora = Date.now()

  // Pedidos da festa (o valor da corrida de cada um já inclui o bônus).
  const { data: pedidos } = await admin
    .from('pedidos_clientes')
    .select('id, valor_corrida, entregador_id, status')
    .eq('festa_id', festaId)
  const ativos = (pedidos || []).filter(p => p.status !== 'cancelado')
  if (ativos.length === 0) return { tipo: 'sem_pedidos' }

  const valorTotal = Math.round(
    ativos.reduce((s, p) => s + (Number(p.valor_corrida) || 0), 0) * 100,
  ) / 100

  // Lojas da festa -> centroide como âncora da busca.
  const { data: fl } = await admin.from('festa_lojas').select('loja_id').eq('festa_id', festaId)
  const lojaIds = (fl || []).map(r => r.loja_id as string)
  if (lojaIds.length === 0) return { tipo: 'sem_localizacao' }
  const { data: lojas } = await admin
    .from('lojas').select('id, nome, latitude, longitude').in('id', lojaIds)
  const comCoord = (lojas || []).filter(l => l.latitude != null && l.longitude != null)
  if (comCoord.length === 0) return { tipo: 'sem_localizacao' }

  const centro = {
    latitude: comCoord.reduce((s, l) => s + Number(l.latitude), 0) / comCoord.length,
    longitude: comCoord.reduce((s, l) => s + Number(l.longitude), 0) / comCoord.length,
  }
  // Loja mais próxima do centro nomeia a corrida.
  const lojaAncora = comCoord
    .map(l => ({ l, d: distanciaKm(centro, { latitude: Number(l.latitude), longitude: Number(l.longitude) }) ?? 0 }))
    .sort((a, b) => a.d - b.d)[0].l

  // Expira ofertas pendentes vencidas desta festa.
  await admin.from('corrida_ofertas').update({ status: 'expirada' })
    .eq('festa_id', festaId).eq('status', 'pendente').lt('expira_em', new Date(agora).toISOString())

  const { data: ofertasExistentes } = await admin
    .from('corrida_ofertas').select('id, entregador_id, status, expira_em')
    .eq('festa_id', festaId)

  const pendenteValida = (ofertasExistentes || []).find(
    o => o.status === 'pendente' && new Date(o.expira_em).getTime() > agora,
  )
  if (pendenteValida) {
    const { data: ent } = await admin.from('entregadores_publicos').select('nome')
      .eq('id', pendenteValida.entregador_id).maybeSingle()
    return { tipo: 'esperando', oferta: pendenteValida, entregador: { nome: ent?.nome || 'Entregador' } }
  }

  const jaOfertados = new Set((ofertasExistentes || []).map(o => o.entregador_id))

  // Entregadores ocupados: com pedido em andamento (fora da própria festa).
  const { data: ocupadosRows } = await admin
    .from('pedidos_clientes').select('entregador_id')
    .not('entregador_id', 'is', null).in('status', ['recebido', 'preparando', 'saiu'])
  const ocupados = new Set((ocupadosRows || []).map(r => r.entregador_id as string))

  const desde = new Date(agora - FRESCOR_LOCALIZACAO_MS).toISOString()
  const { data: pool } = await admin
    .from('entregadores')
    .select('id, nome, latitude, longitude')
    .eq('disponivel', true)
    .not('latitude', 'is', null)
    .not('longitude', 'is', null)
    .gte('localizacao_at', desde)

  const candidatos = (pool || [])
    .filter(e => !jaOfertados.has(e.id) && !ocupados.has(e.id))
    .map(e => ({ ...e, dist: distanciaKm(centro, { latitude: e.latitude, longitude: e.longitude }) }))
    .filter(e => e.dist != null && e.dist <= RAIO_BUSCA_KM)
    .sort((a, b) => (a.dist! - b.dist!))

  if (candidatos.length === 0) return { tipo: 'esgotado', tentativas: jaOfertados.size }

  const escolhido = candidatos[0]
  const distKm = Math.round((escolhido.dist as number) * 100) / 100
  const expira_em = new Date(agora + TEMPO_RESPOSTA_CORRIDA_S * 1000).toISOString()

  const { data: oferta, error } = await admin
    .from('corrida_ofertas')
    .insert({
      pedido_id: null,
      festa_id: festaId,
      entregador_id: escolhido.id,
      loja_id: lojaAncora.id,
      status: 'pendente',
      distancia_km: distKm,
      expira_em,
      bonus_pct: FESTA_BONUS_PCT,
      valor_total: valorTotal,
    })
    .select('*').single()
  if (error || !oferta) throw new Error(error?.message || 'Erro ao criar oferta da festa')

  await dispatchPushOferta(admin, oferta.id)

  return { tipo: 'ofertado', oferta, entregador: { nome: escolhido.nome, distancia_km: distKm } }
}
