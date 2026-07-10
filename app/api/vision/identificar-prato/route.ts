// #1 Commerly Vision — o cliente fotografa um prato e a gente acha onde comprar.
//
// Fluxo: foto -> Gemini identifica o prato e devolve termos de busca -> casamos
// esses termos com `produtos` das lojas e ordenamos por distância do cliente.
//
// A identificação é uma pista, não um veredito: o modelo erra "strogonoff" por
// "frango ao molho". Por isso devolvemos os termos ao cliente, que vê o que foi
// reconhecido e pode corrigir a busca.

import { NextRequest, NextResponse } from 'next/server'
import { rateLimit } from '../../../lib/rate-limit'
import { chamarGemini, parteImagem, extrairJSON, textoDaResposta, MODELO_VISAO } from '../../../lib/gemini'
import { validarImagem } from '../../../lib/imagemEntrada'
import { supabaseDaRota, usuarioDaRota, ipDaRequisicao } from '../../../lib/rotaSupabase'
import { distanciaKm } from '../../../lib/geo'

export const runtime = 'nodejs'

const RAIO_PADRAO_KM = 15
const MAX_LOJAS = 12

type Identificacao = { prato: string; termos: string[]; confianca: number; ingredientes: string[] }

const PROMPT = `Você olha a foto de um prato de comida e identifica o que é, para um app de delivery brasileiro.

Responda:
- "prato": o nome mais provável do prato, em português do Brasil (ex: "X-Bacon", "Feijoada", "Açaí na tigela"). Se não for comida, use "".
- "termos": 2 a 5 palavras-chave curtas para buscar esse prato num cardápio (ex: ["hambúrguer","bacon","x-bacon"]). Minúsculas, sem acento não é necessário remover.
- "ingredientes": até 5 ingredientes visíveis.
- "confianca": 0 a 1, o quanto você tem certeza.

Se a imagem não for comida, devolva {"prato":"","termos":[],"ingredientes":[],"confianca":0}.

Responda APENAS com JSON: {"prato":"...","termos":["..."],"ingredientes":["..."],"confianca":0.0}`

function sanitizar(v: unknown): Identificacao | null {
  const o = v as Record<string, unknown> | null
  if (!o) return null
  const prato = typeof o.prato === 'string' ? o.prato.trim().slice(0, 60) : ''
  const termos = Array.isArray(o.termos)
    ? o.termos.filter((t): t is string => typeof t === 'string' && t.trim().length > 1)
        .map(t => t.trim().toLowerCase().slice(0, 30)).slice(0, 5)
    : []
  const ingredientes = Array.isArray(o.ingredientes)
    ? o.ingredientes.filter((t): t is string => typeof t === 'string').map(t => t.trim().slice(0, 30)).slice(0, 5)
    : []
  const confianca = typeof o.confianca === 'number' && o.confianca >= 0 && o.confianca <= 1 ? o.confianca : 0
  return { prato, termos, ingredientes, confianca }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)

  const img = validarImagem(body?.imagem)
  if ('erro' in img) return NextResponse.json({ erro: img.erro }, { status: 400 })

  const supabase = await supabaseDaRota()
  const user = await usuarioDaRota(supabase)

  // Visão é a rota mais cara que temos; limite apertado.
  const chave = user ? `vision:${user.id}` : `vision-ip:${ipDaRequisicao(request)}`
  if (!rateLimit(chave, 15, 60 * 60_000)) {
    return NextResponse.json({ erro: 'Muitas identificações seguidas. Tente de novo daqui a pouco.' }, { status: 429 })
  }

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    console.error('[vision/identificar-prato] GEMINI_API_KEY ausente')
    return NextResponse.json({ erro: 'Identificação indisponível no momento.' }, { status: 500 })
  }

  const res = await chamarGemini(apiKey, {
    contents: [{ parts: [{ text: PROMPT }, parteImagem(img.base64, img.mimeType)] }],
    generationConfig: { temperature: 0.2, maxOutputTokens: 512, responseMimeType: 'application/json' },
  }, { modelo: MODELO_VISAO, timeoutMs: 30_000 })

  if (!res.ok) {
    console.error('[vision/identificar-prato] gemini falhou:', res.status, res.body.slice(0, 300))
    const msg = res.status === 429
      ? 'Limite de consultas atingido. Tente novamente em alguns minutos.'
      : 'Não consegui analisar a foto. Tente outra.'
    return NextResponse.json({ erro: msg }, { status: 502 })
  }

  const ident = sanitizar(extrairJSON(textoDaResposta(res.data)))
  if (!ident || !ident.prato || ident.termos.length === 0) {
    return NextResponse.json({
      prato: '', termos: [], ingredientes: [], confianca: 0, lojas: [],
      aviso: 'Não reconheci um prato nessa foto. Tente uma foto mais próxima e bem iluminada.',
    })
  }

  // ---------------------------------------------------------------------------
  // Casa os termos com os produtos. `ilike any` via `or` — cada termo vira um
  // filtro sobre nome e descrição.
  // ---------------------------------------------------------------------------
  const filtros = ident.termos.flatMap(t => [`nome.ilike.%${t}%`, `descricao.ilike.%${t}%`]).join(',')

  const { data: produtos, error } = await supabase
    .from('produtos')
    .select('id, loja_id, nome, descricao, preco_venda, imagem_url')
    .or(filtros)
    .limit(120)

  if (error) {
    console.error('[vision/identificar-prato] busca de produtos falhou:', error.message)
    return NextResponse.json({ erro: 'Falha ao buscar lojas.' }, { status: 500 })
  }

  const lojaIds = [...new Set((produtos ?? []).map(p => p.loja_id))]
  if (lojaIds.length === 0) {
    return NextResponse.json({ ...ident, lojas: [], aviso: `Identifiquei "${ident.prato}", mas nenhuma loja por perto vende algo parecido.` })
  }

  const { data: lojas } = await supabase
    .from('lojas_publicas')
    .select('id, nome, localizacao, latitude, longitude, fotos_fachada, taxa_entrega')
    .in('id', lojaIds)

  // Distância só quando o cliente mandou coordenadas; sem elas, não ordenamos
  // por proximidade (e dizemos isso na UI em vez de inventar uma ordem).
  const lat = typeof body?.latitude === 'number' ? body.latitude : null
  const lng = typeof body?.longitude === 'number' ? body.longitude : null

  const porLoja = new Map<string, typeof produtos>()
  for (const p of produtos ?? []) {
    const arr = porLoja.get(p.loja_id) ?? []
    arr.push(p)
    porLoja.set(p.loja_id, arr)
  }

  let resultado = (lojas ?? []).map(l => {
    const dist = lat !== null && lng !== null
      ? distanciaKm({ latitude: lat, longitude: lng }, l)
      : null
    return { ...l, distancia_km: dist, produtos: (porLoja.get(l.id) ?? []).slice(0, 4) }
  })

  if (lat !== null && lng !== null) {
    resultado = resultado
      .filter(l => l.distancia_km === null || l.distancia_km <= RAIO_PADRAO_KM)
      .sort((a, b) => (a.distancia_km ?? Infinity) - (b.distancia_km ?? Infinity))
  }

  return NextResponse.json({ ...ident, lojas: resultado.slice(0, MAX_LOJAS), ordenadoPorDistancia: lat !== null && lng !== null })
}
