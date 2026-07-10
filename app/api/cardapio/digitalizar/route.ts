// #2 Clone de cardápio — o comerciante fotografa o cardápio de papel e a IA
// transcreve os itens. NADA é gravado aqui: devolvemos um rascunho para a tela
// de revisão. A gravação acontece em /api/cardapio/publicar, depois que o
// comerciante confere preço por preço.

import { NextRequest, NextResponse } from 'next/server'
import { rateLimit } from '../../../lib/rate-limit'
import { chamarGemini, parteImagem, extrairJSON, textoDaResposta, MODELO_VISAO } from '../../../lib/gemini'
import { validarImagem } from '../../../lib/imagemEntrada'
import { supabaseDaRota, usuarioDaRota, lojaDoUsuario } from '../../../lib/rotaSupabase'
import { sanitizarRascunho, PROMPT_OCR } from '../../../lib/cardapioIA'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)

  const img = validarImagem(body?.imagem)
  if ('erro' in img) return NextResponse.json({ erro: img.erro }, { status: 400 })

  const supabase = await supabaseDaRota()
  const user = await usuarioDaRota(supabase)
  if (!user) return NextResponse.json({ erro: 'Faça login.' }, { status: 401 })

  const loja = await lojaDoUsuario(supabase, user.id)
  if (!loja) return NextResponse.json({ erro: 'Loja não encontrada.' }, { status: 403 })

  if (!rateLimit(`cardapio-ocr:${user.id}`, 20, 60 * 60_000)) {
    return NextResponse.json({ erro: 'Muitas digitalizações seguidas. Tente de novo daqui a pouco.' }, { status: 429 })
  }

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    console.error('[cardapio/digitalizar] GEMINI_API_KEY ausente')
    return NextResponse.json({ erro: 'Digitalização indisponível no momento.' }, { status: 500 })
  }

  const res = await chamarGemini(apiKey, {
    contents: [{ parts: [{ text: PROMPT_OCR }, parteImagem(img.base64, img.mimeType)] }],
    // Temperatura 0: é transcrição, não criação. Queremos o que está no papel.
    generationConfig: { temperature: 0, maxOutputTokens: 4096, responseMimeType: 'application/json' },
  }, { modelo: MODELO_VISAO, timeoutMs: 45_000 })

  if (!res.ok) {
    console.error('[cardapio/digitalizar] gemini falhou:', res.status, res.body.slice(0, 300))
    const msg = res.status === 429
      ? 'Limite de consultas atingido. Tente novamente em alguns minutos.'
      : 'Não consegui ler o cardápio. Tente uma foto mais nítida e reta.'
    return NextResponse.json({ erro: msg }, { status: 502 })
  }

  const itens = sanitizarRascunho(extrairJSON(textoDaResposta(res.data)), false)

  if (itens.length === 0) {
    return NextResponse.json({
      itens: [],
      aviso: 'Não reconheci itens nessa foto. Fotografe o cardápio de frente, com boa luz, sem sombra sobre o texto.',
    })
  }

  const semPreco = itens.filter(i => i.preco_venda === 0).length

  return NextResponse.json({
    itens,
    aviso: semPreco > 0
      ? `Li ${itens.length} itens, mas não consegui o preço de ${semPreco}. Preencha antes de publicar.`
      : `Li ${itens.length} itens. Confira os preços antes de publicar — OCR erra vírgula.`,
  })
}
