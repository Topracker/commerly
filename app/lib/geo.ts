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
 * Taxa de entrega por distância (R$). Tabela oficial do delivery:
 *   até 2 km = 5 | 2–5 km = 8 | 5–10 km = 12 | acima de 10 km = 15
 * Sem distância (null) usa a faixa base (R$ 5).
 *
 * ATENÇÃO: esta tabela é apenas para EXIBIR a taxa ao cliente antes de
 * confirmar. O valor gravado é recalculado no servidor (trigger
 * `pedidos_clientes_guard` / `calcular_taxa_entrega` em
 * sql/2026-07-03-taxa-distancia.sql). Mantenha as duas em sincronia.
 */
export function taxaEntregaPorDistancia(km: number | null): number {
  if (km == null) return 5
  if (km <= 2) return 5
  if (km <= 5) return 8
  if (km <= 10) return 12
  return 15
}
