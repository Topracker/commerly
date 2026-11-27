import { NextRequest, NextResponse } from 'next/server'
import { chamarGemini, textoDaResposta, MODELO_TEXTO } from '../../../lib/gemini'
import { rateLimit } from '../../../lib/rate-limit'
import { PERGUNTAS_FAQ } from '../../../lib/faq'
import { PRECO_NORMAL, PRECO_FUNDADOR, MESES_FUNDADOR, VAGAS_FUNDADOR } from '../../../lib/precos'

// Chat público da landing /conheca (QR do panfleto) — SEM auth, pergunta
// genérica sobre o produto (preço, como funciona, delivery, fiado etc), nunca
// dado de loja específica (isso é o /assistente, logado). Grounded só no FAQ
// + preços reais, pra não inventar funcionalidade que não existe.
export const runtime = 'nodejs'

const SISTEMA = `Você é o assistente de dúvidas da Commerly, um site/app de gestão para
pequenos comércios brasileiros (vendas, fiado, gastos, produtos, delivery).
Responda SOMENTE com base no FAQ abaixo e nos preços reais. Seja curto (3-5
frases), direto, em português informal mas sem gírias demais. Se não souber
a resposta a partir do material abaixo, diga que não tem certeza e sugira
falar com o suporte ou assinar pra ver na prática — NUNCA invente recurso
que não está listado.

PREÇO: R$ ${PRECO_FUNDADOR}/mês nos primeiros ${MESES_FUNDADOR} meses (oferta de
fundador, só para as primeiras ${VAGAS_FUNDADOR} lojas), depois R$ ${PRECO_NORMAL}/mês. Sem trial grátis — usa depois de assinar.

FAQ:
${PERGUNTAS_FAQ.filter(p => p.publico.includes('comerciante'))
  .map(p => `P: ${p.pergunta}\nR: ${p.resposta.replace(/\n\n/g, ' ')}`)
  .join('\n\n')}`

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'desconhecido'
  if (!rateLimit(`conheca-ia:${ip}`, 10, 60_000)) {
    return NextResponse.json({ erro: 'Muitas perguntas seguidas. Espera um instante.' }, { status: 429 })
  }

  const { pergunta } = await request.json().catch(() => ({}))
  if (!pergunta || typeof pergunta !== 'string' || pergunta.length > 500) {
    return NextResponse.json({ erro: 'Pergunta inválida.' }, { status: 400 })
  }

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    // Fallback sem IA — mesmo padrão do resto do app (lib/gemini.ts): nunca
    // deixa a tela quebrada por falta de chave.
    return NextResponse.json({
      resposta: 'No momento não consigo responder por aqui — dá uma olhada na Central de Ajuda (/suporte) ou já cria sua loja pra ver na prática.',
    })
  }

  const resultado = await chamarGemini(apiKey, {
    system_instruction: { parts: [{ text: SISTEMA }] },
    contents: [{ role: 'user', parts: [{ text: pergunta }] }],
    generationConfig: { temperature: 0.4, maxOutputTokens: 300 },
  }, { modelo: MODELO_TEXTO, timeoutMs: 15_000 })

  if (!resultado.ok) {
    return NextResponse.json({
      resposta: 'Deu um erro aqui pra pensar na resposta — tenta de novo, ou olha a Central de Ajuda (/suporte).',
    })
  }

  return NextResponse.json({ resposta: textoDaResposta(resultado.data) || 'Não consegui montar uma resposta — tenta reformular a pergunta?' })
}
