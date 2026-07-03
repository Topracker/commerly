// Backfill de coordenadas das lojas (latitude/longitude) a partir do endereço
// texto (`localizacao`). Lojas antigas foram criadas antes da geocodificação no
// onboarding e ficaram sem coords — o que zera a taxa de entrega por distância
// (o trigger `pedidos_clientes_guard` usa a distância loja→cliente; sem coords
// da loja, o Haversine dá NULL e cai no default R$5).
//
// Usa os mesmos provedores do /api/geocode: Nominatim (principal) e Photon
// (fallback), ambos OpenStreetMap, sem API key. Respeita o limite de ~1 req/s
// do Nominatim. Idempotente: só toca em lojas sem coords e só grava quando há
// um resultado. Endereços curtos/ambíguos demais (ex.: "MG") são pulados para
// não posicionar a loja no centro de um estado.
//
// Uso:
//   node scripts/backfill-lojas-geocode.mjs            # aplica
//   node scripts/backfill-lojas-geocode.mjs --dry-run  # só mostra o que faria
//
// Lê NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY de .env.local.

import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

const DRY = process.argv.includes('--dry-run')
const UA = 'Commerly/1.0 (+https://commerly.vercel.app)'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
const get = (k) => {
  const m = env.match(new RegExp(`^${k}=(.*)$`, 'm'))
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : null
}
const admin = createClient(get('NEXT_PUBLIC_SUPABASE_URL'), get('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false },
})

async function nominatim(q) {
  const url = new URL('https://nominatim.openstreetmap.org/search')
  url.searchParams.set('format', 'json')
  url.searchParams.set('limit', '1')
  url.searchParams.set('countrycodes', 'br')
  url.searchParams.set('q', q)
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json', 'Accept-Language': 'pt-BR' } })
    if (!res.ok) return null
    const d = await res.json()
    const h = Array.isArray(d) ? d[0] : null
    if (!h?.lat || !h?.lon) return null
    return { lat: parseFloat(h.lat), lng: parseFloat(h.lon), label: h.display_name || '', via: 'nominatim' }
  } catch { return null }
}

async function photon(q) {
  const url = `https://photon.komoot.io/api/?limit=5&lang=default&q=${encodeURIComponent(q)}`
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } })
    if (!res.ok) return null
    const d = await res.json()
    const feats = Array.isArray(d?.features) ? d.features : []
    const f = feats.find((x) => x?.properties?.countrycode === 'BR') || feats[0]
    const c = f?.geometry?.coordinates
    if (!Array.isArray(c) || c.length < 2) return null
    const p = f.properties || {}
    return { lat: Number(c[1]), lng: Number(c[0]), label: [p.name, p.street, p.city, p.state].filter(Boolean).join(', '), via: 'photon' }
  } catch { return null }
}

// Endereço bom o bastante para geocodificar? Evita siglas de estado soltas.
function utilizavel(loc) {
  if (!loc) return false
  const s = String(loc).trim()
  if (s.length < 5) return false            // "MG", "mG", "go" etc.
  if (/^[a-zA-Z]{2}$/.test(s)) return false // sigla de estado isolada
  return true
}

const { data: lojas, error } = await admin
  .from('lojas')
  .select('id, nome, tipo, localizacao, latitude, longitude')
  .or('latitude.is.null,longitude.is.null')
  .order('nome')

if (error) { console.error('erro ao ler lojas:', error.message); process.exit(1) }

console.log(`${lojas.length} loja(s) sem coordenadas.${DRY ? '  [DRY-RUN]' : ''}\n`)

let ok = 0, pulou = 0, falhou = 0
for (const l of lojas) {
  if (!utilizavel(l.localizacao)) {
    console.log(`  PULA   ${l.nome} — endereço insuficiente ("${l.localizacao ?? ''}")`)
    pulou++
    continue
  }
  let hit = await nominatim(l.localizacao)
  await sleep(1100) // respeita o rate limit do Nominatim
  if (!hit) hit = await photon(l.localizacao)
  if (!hit) {
    console.log(`  FALHA  ${l.nome} — sem resultado para "${l.localizacao}"`)
    falhou++
    continue
  }
  console.log(`  OK     ${l.nome} — ${hit.lat.toFixed(5)}, ${hit.lng.toFixed(5)} (${hit.via}) ← "${l.localizacao}"`)
  if (!DRY) {
    const up = await admin.from('lojas').update({ latitude: hit.lat, longitude: hit.lng }).eq('id', l.id)
    if (up.error) { console.log(`         ! erro ao gravar: ${up.error.message}`); falhou++; ok--; }
  }
  ok++
}

console.log(`\nResumo: ${ok} geocodificada(s), ${pulou} pulada(s), ${falhou} sem resultado.`)
