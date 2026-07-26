// Resolução de cidade (nome + slug) a partir de coordenadas ou de um endereço
// em texto. Fonte única usada por:
//
//   - /api/publico/cidade      → onde o CLIENTE está (banner de cobertura)
//   - /api/loja/cidade         → onde a LOJA está (grava lojas.cidade_slug)
//   - scripts/backfill-cidade-slug.mjs (mesma lógica, em JS solto)
//
// Por que isso importa: `cidade_slug` nulo faz o gating cair só no escopo
// `__global__` da flag `delivery` — que hoje está OFF — e a loja não recebe
// pedido nenhum, sem que ninguém perceba. Resolver a cidade é o que liga a
// loja ao mapa de cobertura.

import { slugify } from './crescimento'

const USER_AGENT = 'Commerly/1.0 (+https://commerly.com.br)'

export type Local = { cidade: string; uf: string | null }

const UFS: Record<string, string> = {
  acre: 'AC', alagoas: 'AL', amapa: 'AP', amazonas: 'AM', bahia: 'BA', ceara: 'CE',
  'distrito federal': 'DF', 'espirito santo': 'ES', goias: 'GO', maranhao: 'MA',
  'mato grosso': 'MT', 'mato grosso do sul': 'MS', 'minas gerais': 'MG', para: 'PA',
  paraiba: 'PB', parana: 'PR', pernambuco: 'PE', piaui: 'PI', 'rio de janeiro': 'RJ',
  'rio grande do norte': 'RN', 'rio grande do sul': 'RS', rondonia: 'RO', roraima: 'RR',
  'santa catarina': 'SC', 'sao paulo': 'SP', sergipe: 'SE', tocantins: 'TO',
}

const SIGLAS = new Set(Object.values(UFS))

function semAcento(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/** Os provedores devolvem o estado por extenso ("Goiás"); a UI usa a sigla. */
export function siglaUf(estado: unknown): string | null {
  if (typeof estado !== 'string' || !estado) return null
  if (/^[A-Za-z]{2}$/.test(estado)) {
    const up = estado.toUpperCase()
    return SIGLAS.has(up) ? up : null
  }
  return UFS[semAcento(estado).toLowerCase().trim()] ?? null
}

// Reverso pelo Nominatim: coordenada -> município. `zoom=10` devolve o nível de
// cidade (mais que isso traz bairro/rua, que não interessa aqui).
export async function nominatimReverso(lat: number, lng: number): Promise<Local | null> {
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
    console.error('[cidade] nominatim reverso:', e instanceof Error ? e.message : e)
    return null
  }
}

// O Nominatim público costuma bloquear IP de datacenter (Vercel) — mesmo
// motivo pelo qual /api/geocode já tem esse fallback.
export async function photonReverso(lat: number, lng: number): Promise<Local | null> {
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
    console.error('[cidade] photon reverso:', e instanceof Error ? e.message : e)
    return null
  }
}

/**
 * Cidade a partir do endereço em texto, sem chamar ninguém. O
 * EnderecoAutocomplete grava no formato "Rua X, Bairro, Cidade, UF" — então a
 * UF é o último pedaço e a cidade o penúltimo.
 *
 * Endereços curtos e ambíguos ("MG", "Goiás") devolvem null de propósito: é
 * melhor pedir para o comerciante confirmar o endereço do que fincar a loja
 * numa cidade errada e liberar (ou barrar) pedidos por engano.
 */
export function cidadeDoEndereco(localizacao?: string | null): Local | null {
  const partes = (localizacao || '').split(',').map(p => p.trim()).filter(Boolean)
  if (partes.length === 0) return null

  const ultima = partes[partes.length - 1]
  const uf = siglaUf(ultima)

  // "..., Cidade, UF" — o caso do autocomplete.
  if (uf && partes.length >= 2) {
    const cidade = partes[partes.length - 2]
    // Um pedaço só de UF ("MG") não diz cidade nenhuma.
    if (cidade && !siglaUf(cidade)) return { cidade, uf }
    return null
  }

  // Sem UF no fim: só aceitamos quando o texto inteiro é o nome de uma cidade
  // ("Goiânia"), nunca um endereço completo — aí não dá para saber qual pedaço
  // é a cidade.
  if (partes.length === 1 && !uf && semAcento(ultima).length > 3) {
    return { cidade: ultima, uf: null }
  }
  return null
}

/**
 * Onde fica um ponto: tenta o reverso pelas coordenadas (mais confiável) e cai
 * para a leitura do endereço em texto. Devolve null quando nada resolve.
 */
export async function resolverLocal(
  args: { latitude?: number | null; longitude?: number | null; localizacao?: string | null },
): Promise<Local | null> {
  const { latitude: lat, longitude: lng } = args
  if (typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng)) {
    const porCoords = (await nominatimReverso(lat, lng)) || (await photonReverso(lat, lng))
    if (porCoords) return porCoords
  }
  return cidadeDoEndereco(args.localizacao)
}

const CONECTORES = new Set(['de', 'da', 'do', 'das', 'dos', 'e'])

/**
 * Rótulo legível para um slug quando não temos o nome bonito guardado:
 * "aparecida-de-goiania" -> "Aparecida de Goiania". Perde o acento (o slug já
 * perdeu), então prefira sempre o nome vindo de `cidades_expansao`.
 */
export function nomeDoSlug(slug: string): string {
  return (slug || '')
    .split('-')
    .filter(Boolean)
    .map((p, i) => (i > 0 && CONECTORES.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(' ')
}

export { slugify }
