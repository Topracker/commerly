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

/**
 * Endereço "vago demais" para geocodificar com segurança — só o nome da cidade
 * ("Goiânia", "goiânia-go") ou muito curto ("MG"). O Nominatim resolve esses
 * casos para o centroide do município ou pior, gerando pins errados; melhor
 * não plotar do que plotar no lugar errado.
 */
export function enderecoVago(endereco?: string | null): boolean {
  const e = (endereco || '').trim()
  if (e.length < 10) return true
  // Ignora a UF de duas letras no fim (", GO" / "-GO" / " GO") — ela não torna
  // um "Goiânia, GO" mais específico que "Goiânia". Depois disso, precisa de
  // pelo menos duas partes (ex.: "rua/bairro, cidade") separadas por vírgula.
  const semUf = e.replace(/[\s,\-]+[A-Za-z]{2}\s*$/, '').trim()
  const partes = semUf.split(',').map((s) => s.trim()).filter(Boolean)
  return partes.length < 2
}

export async function geocodificarEndereco(endereco?: string | null): Promise<LatLng | null> {
  const e = endereco?.trim()
  if (!e || enderecoVago(e)) return null
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
      // countrycodes=br (o proxy já força) + "Brazil" no fim → mais precisão.
      const res = await fetch(`/api/geocode?countrycodes=br&q=${encodeURIComponent(`${e}, Brazil`)}`)
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
