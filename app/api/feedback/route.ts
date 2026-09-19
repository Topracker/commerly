// Feedback do comerciante (Bug / Ideia / Melhoria) enviado pelo /feedback.
//
//   POST /api/feedback  { tipo, mensagem }  →  grava em `feedbacks` + avisa a equipe
//
// Por que virou rota (antes era um insert direto do navegador):
// - A equipe fica sabendo NA HORA por e-mail (Resend), com reply_to no dono da
//   loja — responder é um clique. O painel de gestão continua sendo a fonte de
//   verdade e o histórico; o e-mail é só o aviso.
// - A loja é resolvida AQUI pelo JWT: `loja_id` não vem do corpo.
// - O insert usa service role de propósito: `feedbacks` tem a policy
//   `paywall_plano`, e comerciante com plano vencido PRECISA conseguir reclamar
//   (é justamente quando ele mais tem o que dizer). Por isso /feedback está em
//   PAGINAS_AUTENTICADAS no proxy, não no paywall — não "conserte" isso.
//
// Ordem importa: grava primeiro, envia depois. Falha do Resend NÃO derruba o
// feedback — o registro já está no banco e aparece no painel; só loga o erro.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '../../lib/supabase-admin'
import { supabaseDaRota, usuarioDaRota } from '../../lib/rotaSupabase'
import { enviarEmail } from '../../lib/email'
import { montarEmailFeedback } from '../../lib/feedbackEmail'
import { rateLimit } from '../../lib/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TIPOS = ['Bug', 'Ideia', 'Melhoria'] as const
type Tipo = (typeof TIPOS)[number]

const LIMITES = { min: 5, max: 5000 }

export async function POST(req: NextRequest) {
  const supabase = await supabaseDaRota()
  const user = await usuarioDaRota(supabase).catch(() => null)
  if (!user) return NextResponse.json({ erro: 'Não autenticado.' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const tipo = typeof body?.tipo === 'string' ? body.tipo.trim() : ''
  const mensagem = typeof body?.mensagem === 'string' ? body.mensagem.trim() : ''

  if (!TIPOS.includes(tipo as Tipo)) {
    return NextResponse.json({ erro: 'Escolha o tipo do feedback.' }, { status: 400 })
  }
  if (mensagem.length < LIMITES.min) {
    return NextResponse.json({ erro: 'Escreva uma mensagem!' }, { status: 400 })
  }
  if (mensagem.length > LIMITES.max) {
    return NextResponse.json({ erro: 'Mensagem muito longa (máximo 5000 caracteres).' }, { status: 400 })
  }

  // Por usuário (tem sessão), não por IP: 5 por hora é folga para quem escreve
  // de verdade e trava quem apertar "enviar" em loop.
  if (!rateLimit(`feedback:${user.id}`, 5, 3_600_000)) {
    return NextResponse.json(
      { erro: 'Muitos feedbacks enviados. Aguarde um pouco e tente novamente.' },
      { status: 429 },
    )
  }

  const admin = createAdminClient()
  const { data: loja } = await admin
    .from('lojas').select('id, nome').eq('user_id', user.id).maybeSingle()
  if (!loja) return NextResponse.json({ erro: 'Só comerciantes enviam feedback.' }, { status: 403 })

  // `.select()` + checagem: sem isso um bloqueio silencioso viraria "enviado".
  const { data: gravado, error } = await admin
    .from('feedbacks')
    .insert({ loja_id: loja.id, tipo, mensagem })
    .select('id, created_at')
    .single()
  if (error || !gravado) {
    console.error('[api/feedback] insert falhou:', error?.message)
    return NextResponse.json({ erro: 'Erro ao enviar feedback' }, { status: 500 })
  }

  const envio = await enviarEmail(montarEmailFeedback({
    tipo, mensagem, loja: loja.nome, emailDono: user.email || '', criadoEm: gravado.created_at,
  }))
  if (!envio.ok) {
    console.error('[api/feedback] gravado', gravado.id, 'mas Resend falhou:', envio.erro)
  } else {
    console.log('[api/feedback] gravado', gravado.id, '| e-mail:', envio.id)
  }

  return NextResponse.json({ ok: true, id: gravado.id })
}
