import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '../../../lib/supabase-admin'
import { rateLimit } from '../../../lib/rate-limit'
import { enviarEmail } from '../../../lib/email'
import { contaProtegida, templateLinkExclusao } from '../../../lib/exclusaoConta'

export const runtime = 'nodejs'

// ============================================================================
// Página pública /excluir-conta (exigência da Google Play: pedir a exclusão
// SEM estar logado). A pessoa informa o e-mail; se houver conta, recebe um
// link que a leva já autenticada ao passo de confirmação (/conta/excluir).
//
// Mesmo truque do reset de senha (app/api/auth/recuperar): o token sai por
// generateLink (não pelo SMTP quebrado do Supabase) e só é consumido quando a
// PÁGINA chama verifyOtp — um GET de pré-visualização do cliente de e-mail não
// mata o link.
//
// Tipo 'recovery' de propósito, e não 'magiclink': para e-mail sem conta o
// magiclink CRIA o usuário (GoTrue trata como signup), o recovery falha com
// "User not found" — que é o que queremos, em silêncio.
//
// Resposta sempre igual: não confirmamos se o e-mail tem conta.
// ============================================================================

const HOST_CANONICO = 'https://commerly.com.br'

function baseUrl(req: NextRequest): string {
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host')
  if (host && /^localhost|^127\.0\.0\.1/.test(host)) return `http://${host}`
  const env = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, '')
  if (env) {
    try { if (!/\.vercel\.app$/i.test(new URL(env).host)) return env } catch { /* cai no canônico */ }
  }
  return HOST_CANONICO
}

const RESPOSTA_GENERICA = NextResponse.json({ ok: true })

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ erro: 'Informe um e-mail válido.' }, { status: 400 })
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'sem-ip'
  if (!rateLimit(`excluir-email:${email}`, 3, 600_000) || !rateLimit(`excluir-ip:${ip}`, 10, 600_000)) {
    return NextResponse.json({ erro: 'Muitas solicitações. Aguarde alguns minutos.' }, { status: 429 })
  }

  // Conta de teste: responde como se tivesse enviado, mas não envia.
  if (contaProtegida(email)) return RESPOSTA_GENERICA

  const admin = createAdminClient()
  const base = baseUrl(req)
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo: `${base}/conta/excluir` },
  })
  if (error || !data?.properties?.hashed_token) {
    // "User not found" cai aqui — silêncio proposital.
    if (error && !/not found/i.test(error.message)) console.error('[conta/link-publico] generateLink:', error.message)
    return RESPOSTA_GENERICA
  }

  const link = `${base}/conta/excluir?token_hash=${encodeURIComponent(data.properties.hashed_token)}&type=recovery&via=email`
  const { html, texto } = templateLinkExclusao(link)
  const envio = await enviarEmail({ para: email, assunto: 'Excluir sua conta — Commerly', html, texto })
  if (!envio.ok) console.error('[conta/link-publico] Resend falhou:', envio.erro)
  else console.log('[conta/link-publico] Resend aceitou — id:', envio.id)

  return RESPOSTA_GENERICA
}
