// #3 IA que cria cardápio — o comerciante descreve em texto o que vende
// ("tenho hambúrguer, fritas e refri") e a IA devolve nome, descrição,
// categoria e preço sugerido. Rascunho apenas; grava em /api/cardapio/publicar.

import { NextRequest, NextResponse } from 'next/server'
import { rateLimit } from '../../../lib/rate-limit'
import { chamarGemini, extrairJSON, textoDaResposta } from '../../../lib/gemini'
import { supabaseDaRota, usuarioDaRota, lojaDoUsuario } from '../../../lib/rotaSupabase'
import { sanitizarRascunho, promptGeracao } from '../../../lib/cardapioIA'

export const runtime = 'nodejs'

const MAX_DESC = 600

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const descricao = typeof body?.descricao === 'string' ? body.descricao.trim() : ''

  if (!descricao) return NextResponse.json({ erro: 'Descreva o que você vende.' }, { status: 400 })
  if (descricao.length > MAX_DESC) return NextResponse.json({ erro: 'Descrição muito longa.' }, { status: 400 })

  const supabase = await supabaseDaRota()
  const user = await usuarioDaRota(supabase)
  if (!user) return NextResponse.json({ erro: 'Faça login.' }, { status: 401 })

  const loja = await lojaDoUsuario(supabase, user.id)
  if (!loja) return NextResponse.json({ erro: 'Loja não encontrada.' }, { status: 403 })

  if (!rateLimit(`cardapio-gerar:${user.id}`, 30, 60 * 60_000)) {
    return NextResponse.json({ erro: 'Muitas gerações seguidas. Tente de novo daqui a pouco.' }, { status: 429 })
  }

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    console.error('[cardapio/gerar] GEMINI_API_KEY ausente')
    return NextResponse.json({ erro: 'Gerador indisponível no momento.' }, { status: 500 })
  }

  const res = await chamarGemini(apiKey, {
    contents: [{ parts: [{ text: promptGeracao(descricao, String(loja.tipo ?? '')) }] }],
    generationConfig: { temperature: 0.7, maxOutputTokens: 3072, responseMimeType: 'application/json' },
  }, { timeoutMs: 30_000 })

  if (!res.ok) {
    console.error('[cardapio/gerar] gemini falhou:', res.status, res.body.slice(0, 300))
    const msg = res.status === 429
      ? 'Limite de consultas atingido. Tente novamente em alguns minutos.'
      : 'Erro ao gerar o cardápio. Tente novamente.'
    return NextResponse.json({ erro: msg }, { status: 502 })
  }

  const itens = sanitizarRascunho(extrairJSON(textoDaResposta(res.data)), true)

  if (itens.length === 0) {
    return NextResponse.json({ itens: [], aviso: 'Não entendi o que você vende. Tente listar os itens separados por vírgula.' })
  }

  return NextResponse.json({
    itens,
    aviso: 'Os preços são sugestões da IA, baseadas em média de mercado. Ajuste para a sua realidade antes de publicar.',
  })
}
