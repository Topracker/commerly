import { NextRequest, NextResponse } from 'next/server'

// Proxy de geocodificação (endereço → lat/long). 100% gratuito, sem API key.
//
// Por que server-side: o Nominatim bloqueia (403) User-Agent de navegador e o
// `fetch` do browser não deixa alterar esse header. Além disso, o Nominatim
// público costuma bloquear IPs de datacenter (Vercel/AWS) — por isso caímos
// para o Photon (também baseado em OpenStreetMap) quando o Nominatim falha.

export const dynamic = 'force-dynamic'
export const maxDuration = 20

const USER_AGENT = 'Commerly/1.0 (+https://commerly.vercel.app)'

type Geo = { lat: number; lng: number; display_name: string }

// ---- Provedor 1: Nominatim ------------------------------------------------
async function nominatim(params: Record<string, string>): Promise<Geo | null> {
  const url = new URL('https://nominatim.openstreetmap.org/search')
  url.searchParams.set('format', 'json')
  url.searchParams.set('limit', '1')
  url.searchParams.set('addressdetails', '0')
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)

  try {
    const res = await fetch(url.toString(), {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json', 'Accept-Language': 'pt-BR' },
    })
    if (!res.ok) {
      const corpo = await res.text().catch(() => '')
      console.error(`[geocode] nominatim HTTP ${res.status} — ${corpo.slice(0, 160)}`)
      return null
    }
    const data = await res.json()
    const hit = Array.isArray(data) ? data[0] : null
    if (!hit?.lat || !hit?.lon) return null
    return { lat: parseFloat(hit.lat), lng: parseFloat(hit.lon), display_name: hit.display_name || '' }
  } catch (e: any) {
    console.error('[geocode] nominatim erro:', e?.message || e)
    return null
  }
}

// ---- Provedor 2: Photon (fallback, funciona de IPs de datacenter) ---------
async function photon(q: string): Promise<Geo | null> {
  const url = `https://photon.komoot.io/api/?limit=5&lang=default&q=${encodeURIComponent(q)}`
  try {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } })
    if (!res.ok) {
      const corpo = await res.text().catch(() => '')
      console.error(`[geocode] photon HTTP ${res.status} — ${corpo.slice(0, 160)}`)
      return null
    }
    const data = await res.json()
    const feats: any[] = Array.isArray(data?.features) ? data.features : []
    // Prefere um resultado no Brasil.
    const f = feats.find((x) => x?.properties?.countrycode === 'BR') || feats[0]
    const c = f?.geometry?.coordinates
    if (!Array.isArray(c) || c.length < 2) return null
    const p = f.properties || {}
    const label = [p.name, p.street, p.district, p.city, p.state].filter(Boolean).join(', ')
    return { lat: Number(c[1]), lng: Number(c[0]), display_name: label }
  } catch (e: any) {
    console.error('[geocode] photon erro:', e?.message || e)
    return null
  }
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const q = sp.get('q')?.trim()
  const postalcode = sp.get('postalcode')?.trim()

  if (!q && !postalcode) {
    return NextResponse.json({ erro: 'Informe q ou postalcode.' }, { status: 400 })
  }

  // Ordem de tentativas: Nominatim (endereço → CEP) e, se tudo falhar, Photon.
  let hit: Geo | null = null
  let via = ''

  if (q) { hit = await nominatim({ q, countrycodes: 'br' }); if (hit) via = 'nominatim/q' }
  if (!hit && postalcode) { hit = await nominatim({ postalcode, country: 'Brazil' }); if (hit) via = 'nominatim/cep' }
  if (!hit && q) { hit = await photon(q); if (hit) via = 'photon/q' }
  if (!hit && postalcode) { hit = await photon(postalcode); if (hit) via = 'photon/cep' }

  if (!hit) {
    console.error(`[geocode] sem resultado — q="${q || ''}" cep="${postalcode || ''}"`)
    return NextResponse.json({ erro: 'Endereço não encontrado.' }, { status: 404 })
  }

  console.log(`[geocode] ok via ${via} — q="${q || ''}" cep="${postalcode || ''}" → ${hit.lat},${hit.lng}`)
  return NextResponse.json(hit, { headers: { 'Cache-Control': 'public, max-age=86400' } })
}
