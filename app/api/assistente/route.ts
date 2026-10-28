import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { rateLimit } from '../../lib/rate-limit'
import { chamarGemini } from '../../lib/gemini'
import { instrucaoAssistente } from '../../lib/assistenteContexto'

const MAX_PERGUNTA = 2000

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const pergunta: string = typeof body?.pergunta === 'string' ? body.pergunta : ''
  if (!pergunta.trim()) return NextResponse.json({ erro: 'Pergunta vazia' }, { status: 400 })
  if (pergunta.length > MAX_PERGUNTA) {
    return NextResponse.json({ erro: 'Pergunta muito longa.' }, { status: 400 })
  }

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll() {},
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 })

  if (!rateLimit(`assistente:${user.id}`, 20, 60 * 60_000)) {
    return NextResponse.json({ erro: 'Limite de perguntas atingido. Tente novamente em uma hora.' }, { status: 429 })
  }

  const { data: loja } = await supabase
    .from('lojas')
    .select('id, nome, tipo')
    .eq('user_id', user.id)
    .single()
  if (!loja) return NextResponse.json({ erro: 'Loja não encontrada' }, { status: 404 })

  const instrucao = await instrucaoAssistente(supabase, loja)

  const geminiApiKey = process.env.GEMINI_API_KEY
  if (!geminiApiKey) {
    console.error('[assistente] GEMINI_API_KEY ausente')
    return NextResponse.json({ erro: 'Assistente não configurado (GEMINI_API_KEY ausente)' }, { status: 500 })
  }
  console.log('[assistente] contexto chars:', instrucao.length)

  // Retenta até 2x em falhas transitórias (timeout/rede/5xx) antes de errar.
  const resultado = await chamarGemini(geminiApiKey, {
    // Instrução + dados da loja vão como system; a pergunta vai sozinha como
    // fala do usuário, para a IA responder a ela e não ao contexto.
    system_instruction: { parts: [{ text: instrucao }] },
    contents: [{ role: 'user', parts: [{ text: pergunta }] }],
    generationConfig: { temperature: 0.4, maxOutputTokens: 1024 },
  })

  if (!resultado.ok) {
    console.error('[assistente] gemini falhou:', resultado.status, resultado.body.slice(0, 300))
    const msg = resultado.status === 429
      ? 'Limite de consultas atingido. Tente novamente em alguns minutos.'
      : 'Erro ao consultar o assistente. Tente novamente.'
    return NextResponse.json({ erro: msg }, { status: 500 })
  }

  const geminiData = resultado.data
  console.log('[assistente] gemini ok, candidates:', geminiData.candidates?.length ?? 0)
  const resposta = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || 'Não foi possível gerar uma resposta.'

  await supabase.from('assistente_conversas').insert({ loja_id: loja.id, pergunta, resposta })

  return NextResponse.json({ resposta })
}
