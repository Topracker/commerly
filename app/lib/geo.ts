// Utilidades de geolocalização (sem dependências externas).

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
 * Taxa de entrega DINÂMICA por km (modelo iFood), em R$:
 *   taxa = base + (preço_por_km * km), limitada entre mínimo e máximo.
 *   base = R$ 3,00 | R$ 1,00 por km | mínimo R$ 3,00 | máximo R$ 25,00
 * Ex.: 2,3 km → 5,30 | 8,7 km → 11,70. Sem distância (null) → base R$ 3,00.
 *
 * ATENÇÃO: isto é apenas para EXIBIR a prévia ao cliente. O valor gravado é
 * recalculado no servidor (trigger `pedidos_clientes_guard` /
 * `calcular_taxa_entrega` em sql/2026-07-03-taxa-dinamica-km.sql). Mantenha
 * as duas fórmulas em sincronia.
 */
export function taxaEntregaPorDistancia(km: number | null): number {
  const BASE = 3
  const POR_KM = 1
  const MIN = 3
  const MAX = 25
  const taxa = BASE + POR_KM * (km ?? 0)
  return Math.min(MAX, Math.max(MIN, Math.round(taxa * 100) / 100))
}

/** Multiplicador da taxa em horário de pico (surge). */
export const SURGE_PICO = 1.3

/**
 * Horário de pico: sexta, sábado e domingo das 18h às 22h. A taxa de entrega
 * sobe SURGE_PICO (+30%). Usa o horário LOCAL do dispositivo (para o cliente BR
 * bate com o servidor, que calcula em America/Sao_Paulo — ver eh_horario_pico
 * em sql/2026-07-09-melhorias-delivery.sql). Aqui é só a prévia; o servidor é
 * a fonte da verdade no INSERT do pedido.
 */
export function ehHorarioPico(d: Date = new Date()): boolean {
  const dow = d.getDay() // 0=domingo, 5=sexta, 6=sábado
  const h = d.getHours()
  return (dow === 0 || dow === 5 || dow === 6) && h >= 18 && h < 22
}

/** Aplica o surge de pico à taxa (arredonda a 2 casas), se for horário de pico. */
export function taxaComPico(taxaBase: number, pico = ehHorarioPico()): number {
  return pico ? Math.round(taxaBase * SURGE_PICO * 100) / 100 : taxaBase
}
