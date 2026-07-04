import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '../../../lib/supabase-admin'
import { enviarPushParaUsuario, pushConfigurado } from '../../../lib/push'

// Endpoint INTERNO chamado pelo banco (trigger pg_net em `notificacoes`) para
// disparar o push nativo. Autenticado por um bearer secret compartilhado
// (PUSH_DISPATCH_SECRET) — não é uma rota pública de usuário.
//
// Corpo (enviado pelo trigger): { user_id, tipo, titulo, mensagem, link, dados }
export async function POST(request: NextRequest) {
  const secret = process.env.PUSH_DISPATCH_SECRET
  const auth = request.headers.get('authorization') || ''
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }
  if (!pushConfigurado()) {
    // VAPID não configurado: aceita sem erro para não encher a fila do pg_net.
    return NextResponse.json({ ok: true, skipped: 'vapid-nao-configurado' })
  }

  const body = await request.json().catch(() => ({}))
  const { user_id, titulo, mensagem, link, tipo } = body || {}
  if (!user_id || !titulo || !mensagem) {
    return NextResponse.json({ error: 'Campos obrigatórios ausentes' }, { status: 400 })
  }

  const admin = createAdminClient()
  const entregues = await enviarPushParaUsuario(admin, user_id, {
    titulo, mensagem, link, tipo, tag: tipo,
  })

  return NextResponse.json({ ok: true, entregues })
}
