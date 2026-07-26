import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '../../../lib/supabase-admin'
import { rateLimit } from '../../../lib/rate-limit'
import { flagAtiva } from '../../../lib/featureFlags'
import { slugify } from '../../../lib/crescimento'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Descobre em que cidade o cliente está e se o delivery está aberto lá.
//
//   GET /api/publico/cidade?lat=-16.68&lng=-49.25   (GPS)
//   GET /api/publico/cidade?cidade=Goiânia&uf=GO    (endereço digitado)
//
// A resposta traz a posição da cidade no ranking de expansão quando ela já
// pontuou, para a tela de "ainda não chegamos" mostrar o progresso em vez de
// só uma negativa.
//
// A liberação NUNCA é decidida aqui por nome de cidade: sai de flagAtiva(
// 'delivery', slug), que aplica o padrão global com override por cidade. Abrir
// uma cidade é ligar a flag no /admin — nada neste arquivo muda.

const USER_AGENT = 'Commerly/1.0 (+https://commerly.com.br)'

type Local = { cidade: string; uf: string | null }

// Reverso pelo Nominatim: coordenada -> município. `zoom=10` devolve o nível de
// cidade (mais que isso traz bairro/rua, que não interessa aqui).
async function nominatimReverso(lat: number, lng: number): Promise<Local | null> {
  const url = new URL('https://nominatim.openstreetmap.org/reverse')
  url.searchParams.set('format', 'json')
  url.searchParams.set('zoom', '10')
  url.searchParams.set('addressdetails', '1')
  url.searchParams.set('lat', String(lat))
  url.searchParams.set('lon', String(lng))
  try {
    const res = await fetch(url.toString(), {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json', 'Accept-Language': 'pt-BR' },
    })
    if (!res.ok) return null
    const d = await res.json()
    const a = d?.address || {}
    const cidade = a.city || a.town || a.municipality || a.village || a.county || ''
    if (!cidade) return null
    return { cidade: String(cidade), uf: siglaUf(a.state) }
  } catch (e) {
    console.error('[publico/cidade] nominatim reverso:', e instanceof Error ? e.message : e)
    return null
  }
}

// O Nominatim público costuma bloquear IP de datacenter (Vercel) — mesmo
// motivo pelo qual /api/geocode já tem esse fallback.
async function photonReverso(lat: number, lng: number): Promise<Local | null> {
  try {
    const res = await fetch(`https://photon.komoot.io/reverse?lat=${lat}&lon=${lng}&lang=default`, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    })
    if (!res.ok) return null
    const d = await res.json()
    const p = d?.features?.[0]?.properties
    const cidade = p?.city || p?.county || p?.district || p?.name
    if (!cidade) return null
    return { cidade: String(cidade), uf: siglaUf(p?.state) }
  } catch (e) {
    console.error('[publico/cidade] photon reverso:', e instanceof Error ? e.message : e)
    return null
  }
}

const UFS: Record<string, string> = {
  acre: 'AC', alagoas: 'AL', amapa: 'AP', amazonas: 'AM', bahia: 'BA', ceara: 'CE',
  'distrito federal': 'DF', 'espirito santo': 'ES', goias: 'GO', maranhao: 'MA',
  'mato grosso': 'MT', 'mato grosso do sul': 'MS', 'minas gerais': 'MG', para: 'PA',
  paraiba: 'PB', parana: 'PR', pernambuco: 'PE', piaui: 'PI', 'rio de janeiro': 'RJ',
  'rio grande do norte': 'RN', 'rio grande do sul': 'RS', rondonia: 'RO', roraima: 'RR',
  'santa catarina': 'SC', 'sao paulo': 'SP', sergipe: 'SE', tocantins: 'TO',
}

/** Os provedores devolvem o estado por extenso ("Goiás"); a UI usa a sigla. */
function siglaUf(estado: unknown): string | null {
  if (typeof estado !== 'string' || !estado) return null
  if (/^[A-Za-z]{2}$/.test(estado)) return estado.toUpperCase()
  const chave = estado.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
  return UFS[chave] ?? null
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const lat = Number(sp.get('lat'))
  const lng = Number(sp.get('lng'))
  const cidadeParam = sp.get('cidade')?.trim()
  const ufParam = sp.get('uf')?.trim().toUpperCase().slice(0, 2) || null

  const temCoords = Number.isFinite(lat) && Number.isFinite(lng)
  if (!temCoords && !cidadeParam) {
    return NextResponse.json({ erro: 'Informe lat/lng ou cidade.' }, { status: 400 })
  }

  // Rota pública que chama provedores externos: limita por IP como o /geocode.
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip') || 'sem-ip'
  if (!rateLimit(`cidade:${ip}`, 40, 60_000)) {
    return NextResponse.json({ erro: 'Muitas consultas. Aguarde um instante.' }, { status: 429 })
  }

  let local: Local | null = cidadeParam ? { cidade: cidadeParam, uf: ufParam } : null
  if (!local && temCoords) {
    local = (await nominatimReverso(lat, lng)) || (await photonReverso(lat, lng))
  }

  if (!local) {
    // Sem saber a cidade não dá para afirmar que está fechado. Devolvemos
    // `desconhecida` e a tela deixa o cliente navegar — bloquear no escuro
    // seria pior que deixar passar (o checkout ainda barra de verdade).
    return NextResponse.json({ cidade: null, uf: null, slug: null, delivery_liberado: true, desconhecida: true })
  }

  const slug = slugify(local.cidade)
  const admin = createAdminClient()
  const liberado = await flagAtiva('delivery', slug, admin)

  // Posição no ranking de expansão — só faz sentido mostrar se já pontuou.
  let ranking: { posicao: number; pontos: number; meta_pontos: number } | null = null
  const { data: cidades } = await admin
    .from('cidades_expansao').select('slug, pontos, meta_pontos').order('pontos', { ascending: false })
  if (cidades) {
    const idx = cidades.findIndex(c => c.slug === slug)
    if (idx >= 0 && (cidades[idx].pontos ?? 0) > 0) {
      ranking = {
        posicao: idx + 1,
        pontos: cidades[idx].pontos ?? 0,
        meta_pontos: cidades[idx].meta_pontos ?? 0,
      }
    }
  }

  return NextResponse.json({
    cidade: local.cidade,
    uf: local.uf,
    slug,
    delivery_liberado: liberado,
    ranking,
  })
}
