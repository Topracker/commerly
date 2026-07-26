import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '../../../lib/supabase-admin'
import { rateLimit } from '../../../lib/rate-limit'
import { enviarEmail, templateResetSenha } from '../../../lib/email'

// Fluxo PRÓPRIO de reset de senha — não usa o e-mail nem o template do Supabase.
//
// Causa raiz do bug antigo: o template padrão manda `{{ .ConfirmationURL }}`,
// que é uma URL do GoTrue. Qualquer GET nela (pré-visualização do cliente de
// e-mail, scanner de link, proxy de segurança) já CONSOME o token de uso único
// e redireciona — então o clique real do usuário chegava com o token morto.
//
// Aqui: geramos o token com a Admin API (generateLink, que NÃO envia e-mail),
// montamos o link para a nossa própria página /nova-senha?token_hash=&type=
// e disparamos pelo Resend. O token só é consumido quando /nova-senha chama
// verifyOtp — ou seja, quando o usuário de fato abre a página.

function baseUrl(req: NextRequest): string {
  const env = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, '')
  if (env) return env
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host')
  if (host && /^localhost|^127\.0\.0\.1/.test(host)) return `http://${host}`
  return 'https://commerly.com.br'
}

// Resposta única para qualquer desfecho: e-mail inexistente, envio feito ou
// falha de geração. Não revelamos se a conta existe (evita enumeração).
const RESPOSTA_GENERICA = NextResponse.json({ ok: true })

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const emailBruto = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''

  if (!emailBruto || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailBruto)) {
    return NextResponse.json({ erro: 'Informe um e-mail válido.' }, { status: 400 })
  }

  // Rota pública: limita por e-mail (3/10min) e por IP (10/10min) para não
  // virar máquina de spam nem queimar cota do Resend.
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'sem-ip'
  if (!rateLimit(`reset-email:${emailBruto}`, 3, 600_000) || !rateLimit(`reset-ip:${ip}`, 10, 600_000)) {
    return NextResponse.json(
      { erro: 'Muitas solicitações. Aguarde alguns minutos e tente novamente.' },
      { status: 429 },
    )
  }

  const admin = createAdminClient()

  // generateLink('recovery') só GERA o token (não envia e-mail). Falha com
  // "User not found" quando o e-mail não tem conta — tratamos como sucesso
  // silencioso para não vazar a existência da conta.
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'recovery',
    email: emailBruto,
    options: { redirectTo: `${baseUrl(req)}/nova-senha` },
  })

  if (error || !data?.properties?.hashed_token) {
    console.error('[api/auth/recuperar] generateLink falhou:', error?.message || 'sem hashed_token')
    return RESPOSTA_GENERICA
  }

  // hashed_token é exatamente o que verifyOtp espera como `token_hash`.
  const link = `${baseUrl(req)}/nova-senha?token_hash=${encodeURIComponent(
    data.properties.hashed_token,
  )}&type=recovery`

  const { html, texto } = templateResetSenha(link)
  const envio = await enviarEmail({
    para: emailBruto,
    assunto: 'Redefinir sua senha — Commerly',
    html,
    texto,
  })

  if (!envio.ok) {
    // Erro nosso (chave ausente, domínio não verificado no Resend): fica no log
    // do servidor. O usuário vê a mensagem genérica de "verifique seu e-mail",
    // então o log é o único lugar onde isso aparece — não remova.
    console.error('[api/auth/recuperar] Resend falhou:', envio.erro)
  }

  return RESPOSTA_GENERICA
}
