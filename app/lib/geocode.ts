'use client'
// Geocodificação de endereço textual → lat/long, no client, via nosso proxy
// /api/geocode (Nominatim + fallback Photon). Serve de "backfill" em tempo de
// exibição para lojas antigas cadastradas antes do geocode existir, que têm
// `localizacao` mas não têm `latitude`/`longitude` salvos.
//
// Cache em dois níveis para não repetir requisições:
//  - memória (dedup de chamadas concorrentes na mesma sessão);
//  - localStorage (persiste entre navegações; o proxy ainda cacheia 1 dia).

export type LatLng = { latitude: number; longitude: number }

const emVoo = new Map<string, Promise<LatLng | null>>()

function chave(endereco: string): string {
  return 'geo:' + endereco.trim().toLowerCase()
}

export async function geocodificarEndereco(endereco?: string | null): Promise<LatLng | null> {
  const e = endereco?.trim()
  if (!e) return null
  const k = chave(e)

  // Cache persistente. Guardamos também negativos (string 'null') para não
  // martelar o endereço que não resolve.
  try {
    const salvo = localStorage.getItem(k)
    if (salvo != null) {
      if (salvo === 'null') return null
      const v = JSON.parse(salvo)
      if (v && typeof v.latitude === 'number' && typeof v.longitude === 'number') return v
    }
  } catch {
    /* localStorage indisponível — segue sem cache */
  }

  const emAndamento = emVoo.get(k)
  if (emAndamento) return emAndamento

  const p = (async (): Promise<LatLng | null> => {
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(`${e}, Brasil`)}`)
      if (res.ok) {
        const d = await res.json()
        if (typeof d.lat === 'number' && typeof d.lng === 'number') {
          const v: LatLng = { latitude: d.lat, longitude: d.lng }
          try { localStorage.setItem(k, JSON.stringify(v)) } catch {}
          return v
        }
      }
      try { localStorage.setItem(k, 'null') } catch {}
      return null
    } catch {
      return null
    } finally {
      emVoo.delete(k)
    }
  })()

  emVoo.set(k, p)
  return p
}
