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
