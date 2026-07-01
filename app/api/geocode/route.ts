import { NextRequest, NextResponse } from 'next/server'

// Proxy de geocodificação (Nominatim / OpenStreetMap).
//
// Por que server-side: o Nominatim bloqueia (403) requisições com User-Agent de
// navegador ("Mozilla/..."), e o `fetch` do browser NÃO deixa sobrescrever o
// header User-Agent (é proibido). Então chamamos daqui, com um User-Agent
// identificável, como exige a política de uso do Nominatim.

export const dynamic = 'force-dynamic'
export const maxDuration = 15

const USER_AGENT = 'Commerly/1.0 (+https://commerly.vercel.app)'

async function buscar(params: Record<string, string>) {
  const url = new URL('https://nominatim.openstreetmap.org/search')
  url.searchParams.set('format', 'json')
  url.searchParams.set('limit', '1')
  url.searchParams.set('addressdetails', '0')
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)

  const res = await fetch(url.toString(), {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/json',
      'Accept-Language': 'pt-BR',
    },
  })
  if (!res.ok) return null
  const data = await res.json()
  const hit = Array.isArray(data) ? data[0] : null
  if (!hit?.lat || !hit?.lon) return null
  return {
    lat: parseFloat(hit.lat),
    lng: parseFloat(hit.lon),
    display_name: (hit.display_name as string) || '',
  }
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const q = sp.get('q')?.trim()
  const postalcode = sp.get('postalcode')?.trim()

  if (!q && !postalcode) {
    return NextResponse.json({ erro: 'Informe q ou postalcode.' }, { status: 400 })
  }

  try {
    // 1) Busca pelo endereço (texto livre). 2) Se falhar, tenta pelo CEP.
    let hit = q ? await buscar({ q, countrycodes: 'br' }) : null
    if (!hit && postalcode) hit = await buscar({ postalcode, country: 'Brazil' })

    if (!hit) return NextResponse.json({ erro: 'Endereço não encontrado.' }, { status: 404 })

    return NextResponse.json(hit, {
      headers: { 'Cache-Control': 'public, max-age=86400' },
    })
  } catch {
    return NextResponse.json({ erro: 'Erro ao geocodificar.' }, { status: 502 })
  }
}
