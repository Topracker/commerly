// Multi-entrega: o entregador leva até 2 pedidos na mesma viagem.
//
// Funções puras — usadas no dashboard do entregador (para mostrar "Aceitar
// junto") e na rota /api/entregador/aceitar-junto (que decide de verdade).
// Não importe nada de server/React aqui.

import { distanciaKm, type Coord } from './geo'

/** Quantos pedidos um entregador pode carregar ao mesmo tempo. */
export const MAX_ENTREGAS_SIMULTANEAS = 2

/** As duas lojas precisam estar a no máximo isto uma da outra. */
export const RAIO_LOJAS_KM = 2.5

/** Os dois endereços de entrega também. Sem isso a "mesma rota" vira desvio. */
export const RAIO_ENTREGAS_KM = 2.5

export type PedidoRota = {
  id: string
  loja: Coord
  entrega: Coord
}

export type Parada = {
  pedidoId: string
  tipo: 'coleta' | 'entrega'
  coord: Coord
}

export type Rota = {
  paradas: Parada[]
  distanciaKm: number
}

const coordValida = (c: Coord) => c?.latitude != null && c?.longitude != null

/**
 * Sequências válidas de 2 coletas (C) + 2 entregas (E).
 * Restrição de precedência: só se entrega o que já foi coletado.
 * São as 6 permutações de [C0,C1,E0,E1] que respeitam C_i antes de E_i.
 */
const SEQUENCIAS: [number, 'coleta' | 'entrega'][][] = [
  [[0, 'coleta'], [1, 'coleta'], [0, 'entrega'], [1, 'entrega']], // loja1 → loja2 → cliente1 → cliente2
  [[0, 'coleta'], [1, 'coleta'], [1, 'entrega'], [0, 'entrega']],
  [[1, 'coleta'], [0, 'coleta'], [0, 'entrega'], [1, 'entrega']],
  [[1, 'coleta'], [0, 'coleta'], [1, 'entrega'], [0, 'entrega']],
  [[0, 'coleta'], [0, 'entrega'], [1, 'coleta'], [1, 'entrega']], // entrega a 1ª antes de coletar a 2ª
  [[1, 'coleta'], [1, 'entrega'], [0, 'coleta'], [0, 'entrega']],
]

/** Soma das distâncias entre paradas consecutivas, partindo de `origem`. */
function comprimento(origem: Coord, paradas: Parada[]): number | null {
  let total = 0
  let anterior = origem
  for (const p of paradas) {
    const d = distanciaKm(anterior, p.coord)
    if (d == null) return null
    total += d
    anterior = p.coord
  }
  return Math.round(total * 100) / 100
}

/**
 * Melhor ordem de visita para os dois pedidos, saindo de `origem` (a posição
 * atual do entregador). Testa as 6 sequências válidas e devolve a mais curta.
 *
 * Retorna null se faltar alguma coordenada — sem coordenada não há rota, e
 * chutar seria pior do que não oferecer o agrupamento.
 */
export function melhorRota(origem: Coord, a: PedidoRota, b: PedidoRota): Rota | null {
  const pedidos = [a, b]
  if (!coordValida(origem)) return null
  for (const p of pedidos) {
    if (!coordValida(p.loja) || !coordValida(p.entrega)) return null
  }

  let melhor: Rota | null = null
  for (const seq of SEQUENCIAS) {
    const paradas: Parada[] = seq.map(([i, tipo]) => ({
      pedidoId: pedidos[i].id,
      tipo,
      coord: tipo === 'coleta' ? pedidos[i].loja : pedidos[i].entrega,
    }))
    const km = comprimento(origem, paradas)
    if (km == null) return null
    if (!melhor || km < melhor.distanciaKm) melhor = { paradas, distanciaKm: km }
  }
  return melhor
}

/**
 * Os dois pedidos podem ser levados juntos?
 * Critério: lojas próximas entre si E entregas próximas entre si. É o que o
 * entregador consegue conferir no mapa — e evita chamar de "mesma rota" um
 * desvio de bairro.
 */
export function podemSerAgrupados(a: PedidoRota, b: PedidoRota): boolean {
  if (a.id === b.id) return false
  const dLojas = distanciaKm(a.loja, b.loja)
  const dEntregas = distanciaKm(a.entrega, b.entrega)
  if (dLojas == null || dEntregas == null) return false
  return dLojas <= RAIO_LOJAS_KM && dEntregas <= RAIO_ENTREGAS_KM
}

/** Ordem 1-based de coleta e de entrega de cada pedido, a partir da rota. */
export function ordensDaRota(rota: Rota): Record<string, { coleta: number; entrega: number }> {
  const out: Record<string, { coleta: number; entrega: number }> = {}
  let nColeta = 0
  let nEntrega = 0
  for (const p of rota.paradas) {
    const atual = out[p.pedidoId] ?? { coleta: 0, entrega: 0 }
    if (p.tipo === 'coleta') atual.coleta = ++nColeta
    else atual.entrega = ++nEntrega
    out[p.pedidoId] = atual
  }
  return out
}
