// #9 IA Nutricionista — classifica os produtos da loja em tags de restrição.
//
// Chamado pelo comerciante (botão nas configurações) e reaproveitado por
// qualquer produto novo. O resultado fica em `produtos.tags_nutri`, porque a
// busca do cliente filtra por tag e não pode chamar o modelo em tempo real.
//
// Só reclassifica o que está sem análise ou mudou desde a última — evita
// queimar cota do Gemini reprocessando o cardápio inteiro a cada clique.

import { NextRequest, NextResponse } from 'next/server'
import { rateLimit } from '../../../lib/rate-limit'
import { chamarGemini, extrairJSON, textoDaResposta } from '../../../lib/gemini'
import { supabaseDaRota, usuarioDaRota, lojaDoUsuario } from '../../../lib/rotaSupabase'
import { promptClassificacao, sanitizarTags, type ProdutoParaClassificar } from '../../../lib/nutri'

export const runtime = 'nodejs'

/** Lote por chamada. Muitos itens num prompt só degradam a precisão. */
const LOTE = 20

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const reclassificarTudo = body?.tudo === true

  const supabase = await supabaseDaRota()
  const user = await usuarioDaRota(supabase)
  if (!user) return NextResponse.json({ erro: 'Faça login.' }, { status: 401 })

  const loja = await lojaDoUsuario(supabase, user.id)
  if (!loja) return NextResponse.json({ erro: 'Loja não encontrada.' }, { status: 403 })

  if (!rateLimit(`nutri:${user.id}`, 10, 60 * 60_000)) {
    return NextResponse.json({ erro: 'Aguarde alguns minutos para classificar de novo.' }, { status: 429 })
  }

  let q = supabase
    .from('produtos')
    .select('id, nome, descricao, categoria')
    .eq('loja_id', loja.id)
    .limit(LOTE)

  if (!reclassificarTudo) q = q.is('nutri_analisado_em', null)

  const { data: produtos, error } = await q
  if (error) {
    console.error('[nutri] leitura de produtos falhou:', error.message)
    return NextResponse.json({ erro: 'Falha ao ler os produtos.' }, { status: 500 })
  }
  if (!produtos || produtos.length === 0) {
    return NextResponse.json({ classificados: 0, restantes: 0, aviso: 'Todos os produtos já estão classificados.' })
  }

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    console.error('[nutri] GEMINI_API_KEY ausente')
    return NextResponse.json({ erro: 'Classificação indisponível no momento.' }, { status: 500 })
  }

  const res = await chamarGemini(apiKey, {
    contents: [{ parts: [{ text: promptClassificacao(produtos as ProdutoParaClassificar[]) }] }],
    // Zero criatividade: classificação de alergênico não é lugar para variação.
    generationConfig: { temperature: 0, maxOutputTokens: 2048, responseMimeType: 'application/json' },
  }, { timeoutMs: 30_000 })

  if (!res.ok) {
    console.error('[nutri] gemini falhou:', res.status, res.body.slice(0, 300))
    return NextResponse.json({ erro: 'Erro ao classificar. Tente novamente.' }, { status: 502 })
  }

  const bruto = extrairJSON<unknown[]>(textoDaResposta(res.data))
  if (!Array.isArray(bruto)) {
    console.error('[nutri] resposta não parseável:', textoDaResposta(res.data).slice(0, 300))
    return NextResponse.json({ erro: 'Resposta inesperada da IA. Tente novamente.' }, { status: 502 })
  }

  // Só aceitamos ids que estavam no lote — o modelo não escolhe qual produto tocar.
  const idsDoLote = new Set(produtos.map(p => p.id))
  const agora = new Date().toISOString()
  let classificados = 0

  for (const item of bruto) {
    const o = item as Record<string, unknown>
    const id = typeof o.id === 'string' ? o.id : ''
    if (!idsDoLote.has(id)) continue

    const tags = sanitizarTags(o.tags)
    const { error: upErr } = await supabase
      .from('produtos')
      .update({ tags_nutri: tags, nutri_analisado_em: agora })
      .eq('id', id)
      .eq('loja_id', loja.id)

    if (upErr) console.error('[nutri] update falhou para', id, upErr.message)
    else classificados++
  }

  // Produtos que ainda faltam (o botão da UI chama de novo até zerar).
  const { count } = await supabase
    .from('produtos')
    .select('id', { count: 'exact', head: true })
    .eq('loja_id', loja.id)
    .is('nutri_analisado_em', null)

  return NextResponse.json({ classificados, restantes: count ?? 0 })
}
