import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { distanciaKm } from './geo'
import { RAIO_BUSCA_KM, TEMPO_RESPOSTA_CORRIDA_S, FRESCOR_LOCALIZACAO_MS } from './entregadores'
import { dispatchPushOferta } from './pushDispatch'

// Núcleo do despacho de corridas (pool de entregadores estilo Uber). Reusado
// pela busca manual do comerciante (/api/entrega/buscar-entregador) e pela
// reentrega automática (/api/entrega/checar-entregador). Sempre roda com service
// role (admin) — le a posicao dos entregadores (RLS owner-only) e cria a oferta.

export type LojaCoord = { id: string; latitude: number | null; longitude: number | null }

export type ResultadoDespacho =
  | { tipo: 'ofertado'; oferta: any; entregador: { nome: string; distancia_km: number } }
  | { tipo: 'esperando'; oferta: any; entregador: { nome: string } }
  | { tipo: 'esgotado'; tentativas: number }
  | { tipo: 'sem_localizacao' }

/**
 * Oferta o pedido ao próximo entregador disponível mais próximo da loja (raio de
 * 5 km, ordenado por distância) que ainda não recebeu oferta deste pedido.
 * Idempotente enquanto houver oferta pendente válida (retorna 'esperando').
 */
export async function ofertarProximoEntregador(
  admin: SupabaseClient,
  pedidoId: string,
  loja: LojaCoord,
): Promise<ResultadoDespacho> {
  if (loja.latitude == null || loja.longitude == null) return { tipo: 'sem_localizacao' }

  const agora = Date.now()

  // Expira ofertas pendentes vencidas deste pedido (nao bloqueiam o proximo).
  await admin.from('corrida_ofertas').update({ status: 'expirada' })
    .eq('pedido_id', pedidoId).eq('status', 'pendente').lt('expira_em', new Date(agora).toISOString())

  const { data: ofertasExistentes } = await admin
    .from('corrida_ofertas').select('id, entregador_id, status, expira_em, distancia_km')
    .eq('pedido_id', pedidoId)

  // Ja ha uma oferta pendente valida -> aguarda a resposta (nao duplica).
  const pendenteValida = (ofertasExistentes || []).find(
    o => o.status === 'pendente' && new Date(o.expira_em).getTime() > agora,
  )
  if (pendenteValida) {
    const { data: ent } = await admin.from('entregadores_publicos').select('nome').eq('id', pendenteValida.entregador_id).maybeSingle()
    return { tipo: 'esperando', oferta: pendenteValida, entregador: { nome: ent?.nome || 'Entregador' } }
  }

  const jaOfertados = new Set((ofertasExistentes || []).map(o => o.entregador_id))

  // Entregadores ocupados: com um pedido em andamento atribuido.
  const { data: ocupadosRows } = await admin
    .from('pedidos_clientes').select('entregador_id')
    .not('entregador_id', 'is', null).in('status', ['recebido', 'preparando', 'saiu'])
  const ocupados = new Set((ocupadosRows || []).map(r => r.entregador_id as string))

  // Pool: entregadores Online com posicao recente.
  //
  // De proposito NAO filtramos por kit (`entregadores.kit_comprado`): nao existe
  // compra de kit funcional hoje — POST /api/kit so abre um pedido
  // 'aguardando_pagamento' e quem avanca o status e a operacao, pelo /admin.
  // Exigir o kit aqui deixaria a plataforma sem entregador nenhum. Alem disso
  // `kit_comprado` e coluna legada que nada escreve (o estado real vive em
  // `kit_pedidos`), entao o filtro zeraria o pool para sempre.
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

  if (candidatos.length === 0) return { tipo: 'esgotado', tentativas: jaOfertados.size }

  const escolhido = candidatos[0]
  const distKm = Math.round((escolhido.dist as number) * 100) / 100
  const expira_em = new Date(agora + TEMPO_RESPOSTA_CORRIDA_S * 1000).toISOString()

  const { data: oferta, error } = await admin
    .from('corrida_ofertas')
    .insert({ pedido_id: pedidoId, entregador_id: escolhido.id, loja_id: loja.id, status: 'pendente', distancia_km: distKm, expira_em })
    .select('*').single()
  if (error || !oferta) throw new Error(error?.message || 'Erro ao criar oferta')

  await dispatchPushOferta(admin, oferta.id)

  return { tipo: 'ofertado', oferta, entregador: { nome: escolhido.nome, distancia_km: distKm } }
}
