// Backfill de `lojas.cidade_slug` (e `uf`) nas lojas que ficaram sem cidade.
//
// Por que importa: o gating de `delivery` usa o slug da cidade da loja. Com
// `cidade_slug` nulo, `getFlags` só enxerga o escopo `__global__` — que hoje
// está OFF — e o checkout recusa TODO pedido daquela loja, silenciosamente.
//
// O trigger `resolver_cidade_loja` no banco só resolve cidades que existem em
// `cidades_expansao` (5 hoje). Quem abriu loja em Porto Alegre ou Miguelópolis
// caiu fora e ficou com o slug nulo — é esse buraco que este script tapa,
// usando a mesma lógica de app/lib/cidade.ts: reverso pelas coordenadas
// (Nominatim → Photon, ambos OpenStreetMap, sem API key) e, na falta delas,
// leitura do endereço em texto no formato "Rua, Bairro, Cidade, UF".
//
// Endereços curtos e ambíguos ("MG") são PULADOS de propósito: fincar a loja
// numa cidade errada libera/barra pedidos no lugar errado. Essas lojas seguem
// com o aviso no dashboard pedindo o endereço.
//
// Uso:
//   node scripts/backfill-cidade-slug.mjs            # aplica
//   node scripts/backfill-cidade-slug.mjs --dry-run  # só mostra o que faria
//
// Lê NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY de .env.local.

import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

const DRY = process.argv.includes('--dry-run')
const UA = 'Commerly/1.0 (+https://commerly.com.br)'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
const get = (k) => {
  const m = env.match(new RegExp(`^${k}=(.*)$`, 'm'))
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : null
}
const admin = createClient(get('NEXT_PUBLIC_SUPABASE_URL'), get('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false },
})

const UFS = {
  acre: 'AC', alagoas: 'AL', amapa: 'AP', amazonas: 'AM', bahia: 'BA', ceara: 'CE',
  'distrito federal': 'DF', 'espirito santo': 'ES', goias: 'GO', maranhao: 'MA',
  'mato grosso': 'MT', 'mato grosso do sul': 'MS', 'minas gerais': 'MG', para: 'PA',
  paraiba: 'PB', parana: 'PR', pernambuco: 'PE', piaui: 'PI', 'rio de janeiro': 'RJ',
  'rio grande do norte': 'RN', 'rio grande do sul': 'RS', rondonia: 'RO', roraima: 'RR',
  'santa catarina': 'SC', 'sao paulo': 'SP', sergipe: 'SE', tocantins: 'TO',
}
const SIGLAS = new Set(Object.values(UFS))
const semAcento = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')

function siglaUf(estado) {
  if (typeof estado !== 'string' || !estado) return null
  if (/^[A-Za-z]{2}$/.test(estado)) {
    const up = estado.toUpperCase()
    return SIGLAS.has(up) ? up : null
  }
  return UFS[semAcento(estado).toLowerCase().trim()] ?? null
}

function slugify(s) {
  return semAcento(s || '').toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

async function nominatimReverso(lat, lng) {
  const url = new URL('https://nominatim.openstreetmap.org/reverse')
  url.searchParams.set('format', 'json')
  url.searchParams.set('zoom', '10')
  url.searchParams.set('addressdetails', '1')
  url.searchParams.set('lat', String(lat))
  url.searchParams.set('lon', String(lng))
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json', 'Accept-Language': 'pt-BR' } })
    if (!res.ok) return null
    const a = (await res.json())?.address || {}
    const cidade = a.city || a.town || a.municipality || a.village || a.county
    return cidade ? { cidade: String(cidade), uf: siglaUf(a.state) } : null
  } catch { return null }
}

async function photonReverso(lat, lng) {
  try {
    const res = await fetch(`https://photon.komoot.io/reverse?lat=${lat}&lon=${lng}&lang=default`,
      { headers: { 'User-Agent': UA, Accept: 'application/json' } })
    if (!res.ok) return null
    const p = (await res.json())?.features?.[0]?.properties
    const cidade = p?.city || p?.county || p?.district || p?.name
    return cidade ? { cidade: String(cidade), uf: siglaUf(p?.state) } : null
  } catch { return null }
}

// "Rua X, Bairro, Cidade, UF" -> { cidade, uf }. Ver app/lib/cidade.ts.
function cidadeDoEndereco(localizacao) {
  const partes = (localizacao || '').split(',').map((p) => p.trim()).filter(Boolean)
  if (partes.length === 0) return null
  const ultima = partes[partes.length - 1]
  const uf = siglaUf(ultima)
  if (uf && partes.length >= 2) {
    const cidade = partes[partes.length - 2]
    return cidade && !siglaUf(cidade) ? { cidade, uf } : null
  }
  if (partes.length === 1 && !uf && semAcento(ultima).length > 3) return { cidade: ultima, uf: null }
  return null
}

const { data: lojas, error } = await admin
  .from('lojas').select('id, nome, localizacao, latitude, longitude, cidade_slug, uf')
  .is('cidade_slug', null)
if (error) { console.error('Erro ao listar lojas:', error.message); process.exit(1) }

console.log(`${lojas.length} loja(s) sem cidade_slug.${DRY ? ' (dry-run)' : ''}\n`)

let ok = 0, pulados = 0
for (const l of lojas) {
  const temCoords = l.latitude != null && l.longitude != null
  let local = null

  if (temCoords) {
    local = await nominatimReverso(l.latitude, l.longitude)
    if (!local) local = await photonReverso(l.latitude, l.longitude)
    await sleep(1100) // limite de ~1 req/s do Nominatim
  }
  if (!local) local = cidadeDoEndereco(l.localizacao)

  const slug = local ? slugify(local.cidade) : null
  if (!slug) {
    console.log(`  – ${l.nome} — não resolveu (${JSON.stringify(l.localizacao)}) → segue sem cidade`)
    pulados++
    continue
  }

  console.log(`  ✓ ${l.nome} → ${slug}${local.uf ? ` / ${local.uf}` : ''} (${temCoords ? 'coords' : 'endereço'})`)
  if (!DRY) {
    const { error: e } = await admin.from('lojas')
      .update({ cidade_slug: slug, uf: local.uf ?? l.uf ?? null }).eq('id', l.id)
    if (e) { console.error(`    ! falhou: ${e.message}`); pulados++; continue }
  }
  ok++
}

console.log(`\n${ok} resolvida(s), ${pulados} sem resolver.`)
