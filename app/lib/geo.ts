// Utilidades de geolocalização (sem dependências externas).

import { JANELA_PICO } from './precoDinamico'
import { diaSemanaLoja, horaLoja } from './datas'

export type Coord = { latitude?: number | null; longitude?: number | null }

/**
 * Distância em km entre dois pontos (fórmula de Haversine).
 * Retorna null se algum dos pontos não tiver coordenadas.
 */
export function distanciaKm(a: Coord, b: Coord): number | null {
  if (a?.latitude == null || a?.longitude == null || b?.latitude == null || b?.longitude == null) {
    return null
  }
  const R = 6371 // raio da Terra em km
  const rad = (g: number) => (g * Math.PI) / 180
  const dLat = rad(b.latitude - a.latitude)
  const dLon = rad(b.longitude - a.longitude)
  const lat1 = rad(a.latitude)
  const lat2 = rad(b.latitude)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2)
  return 2 * R * Math.asin(Math.sqrt(h))
}

// Velocidade média assumida para o ETA da entrega: ~1 km a cada 5 minutos
// (12 km/h — condizente com moto/bike em trânsito urbano de bairro).
export const MINUTOS_POR_KM = 5

/**
 * Tempo estimado de chegada (em minutos) a partir da distância em km.
 * 1 km ≈ 5 min. Sempre pelo menos 1 min quando há distância; null sem coords.
 */
export function etaMinutos(km: number | null): number | null {
  if (km == null) return null
  return Math.max(1, Math.round(km * MINUTOS_POR_KM))
}

/** Formata o ETA de forma amigável: "menos de 1 min", "8 min", "1 h 5 min". */
export function formatarEta(min: number | null): string {
  if (min == null) return ''
  if (min < 1) return 'menos de 1 min'
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m > 0 ? `${h} h ${m} min` : `${h} h`
}

/** Formata uma distância em km no padrão brasileiro (ex: "2,3 km", "850 m"). */
export function formatarDistancia(km: number | null): string {
  if (km == null) return ''
  if (km < 1) return `${Math.round(km * 1000)} m`
  return `${km.toFixed(1).replace('.', ',')} km`
}

/**
 * Desde 2026-11-26 o CLIENTE e o ENTREGADOR têm preços diferentes e a Commerly
 * cobre a diferença (sql/2026-11-26-separa-taxa-cliente-corrida-entregador.sql):
 *
 *   TAXA_ENTREGA       → o que o cliente paga (preço de mercado, iFood/99):
 *                        R$ 4,00 + R$ 1,50/km, mínimo R$ 4,00, máximo R$ 25,00
 *                        1 km → 5,50 | 4 km → 10,00 | 8 km → 16,00
 *   CORRIDA_ENTREGADOR → o que o entregador recebe (valor_corrida):
 *                        R$ 9,00 até 2,5 km + R$ 3,00/km depois, máximo R$ 45,00
 *                        1 km → 9,00 | 4 km → 13,50 | 8 km → 25,50
 *
 * Pico (+30%) vale para os dois.
 *
 * ATENÇÃO: isto é apenas para EXIBIR a prévia ao cliente. O valor gravado é
 * recalculado no servidor (trigger `pedidos_clientes_guard` /
 * `calcular_taxa_entrega` + `calcular_valor_corrida`). O banco tem
 * uma CÓPIA destes números: mexer em TAXA_ENTREGA exige mexer lá também. O
 * texto da taxa em /configuracoes é montado a partir de TAXA_ENTREGA.
 */
export const TAXA_ENTREGA = { base: 4, porKm: 1.5, min: 4, max: 25 } as const

/** O que o CLIENTE paga de entrega (espelho de calcular_taxa_entrega). */
export function taxaEntregaPorDistancia(km: number | null): number {
  const { base, porKm, min, max } = TAXA_ENTREGA
  const taxa = base + porKm * (km ?? 0)
  return Math.min(max, Math.max(min, Math.round(taxa * 100) / 100))
}

export const CORRIDA_ENTREGADOR = { base: 9, raioKm: 2.5, porKm: 3, max: 45 } as const

/** O que o ENTREGADOR recebe (espelho de calcular_valor_corrida). Commerly cobre a diferença. */
export function valorCorridaPorDistancia(km: number | null): number {
  const { base, raioKm, porKm, max } = CORRIDA_ENTREGADOR
  const v = base + porKm * Math.max(0, (km ?? 0) - raioKm)
  return Math.min(max, Math.round(v * 100) / 100)
}

/** Multiplicador da taxa em horário de pico (surge). */
export const SURGE_PICO = 1.3

/**
 * Horário de pico: sexta, sábado e domingo das 18h às 22h. A taxa de entrega
 * sobe SURGE_PICO (+30%). Calcula em America/Sao_Paulo (app/lib/datas.ts), como o
 * servidor (eh_horario_pico em sql/2026-07-09-melhorias-delivery.sql). Aqui é só a prévia; o servidor é
 * a fonte da verdade no INSERT do pedido.
 */
export function ehHorarioPico(d: Date = new Date()): boolean {
  const dow = diaSemanaLoja(d) // 0=domingo, 5=sexta, 6=sábado
  const h = horaLoja(d)
  return (JANELA_PICO.dias as readonly number[]).includes(dow)
    && h >= JANELA_PICO.inicio && h < JANELA_PICO.fim
}

/** Aplica o surge de pico à taxa (arredonda a 2 casas), se for horário de pico. */
export function taxaComPico(taxaBase: number, pico = ehHorarioPico()): number {
  return pico ? Math.round(taxaBase * SURGE_PICO * 100) / 100 : taxaBase
}
