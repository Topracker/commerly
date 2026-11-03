import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createAdminClient } from '../../../lib/supabase-admin'
import { rateLimit } from '../../../lib/rate-limit'
import { enviarEmail, templateCodigoAcesso } from '../../../lib/email'
import { formatarHora } from '../../../lib/datas'

// Envio do CÓDIGO de acesso por e-mail (cadastro com senha e login sem senha),
// pelo NOSSO Resend — o mesmo caminho do reset de senha (/api/auth/recuperar).
//
// Por quê: o código antes saía de `supabase.auth.signInWithOtp`, que depende do
// SMTP configurado no painel do Supabase (Gmail). Esse SMTP parou de entregar e
// travou cadastro e login por e-mail (ver "Pendências conhecidas" no CLAUDE.md).
//
// Como: `admin.generateLink({ type: 'magiclink' })` só GERA o token (não envia
// nada) e devolve `properties.email_otp`, o código de 6 dígitos que a tela já
// confere com `verifyOtp({ email, token, type: 'email' })`. Nenhuma tela de
// verificação muda — só quem entrega o e-mail.
//
// Se o Resend falhar (chave ausente, domínio não verificado), cai no envio
// antigo pelo Supabase: no pior caso o comportamento é o de antes.

// Resposta única quando a conta não existe ou a geração falha: não revelamos
// se o e-mail tem conta (evita enumeração).
const OK = () => NextResponse.json({ ok: true })

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ erro: 'Informe um e-mail válido.' }, { status: 400 })
  }

  // Rota pública: limita por e-mail e por IP para não virar máquina de spam
  // nem queimar a cota do Resend.
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'sem-ip'
  if (!rateLimit(`codigo-email:${email}`, 5, 600_000) || !rateLimit(`codigo-ip:${ip}`, 15, 600_000)) {
    return NextResponse.json(
      { erro: 'Muitas solicitações. Aguarde alguns minutos e tente novamente.' },
      { status: 429 },
    )
  }

  const admin = createAdminClient()
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
  const codigo = data?.properties?.email_otp

  if (error || !codigo) {
    // Conta inexistente cai aqui ("User not found"). As telas só chamam esta
    // rota para conta que existe (o cadastro passa antes por /pre-cadastro).
    console.error('[api/auth/enviar-codigo] generateLink falhou:', error?.message || 'sem email_otp')
    return OK()
  }

  const { html, texto } = templateCodigoAcesso(codigo)
  const envio = await enviarEmail({
    para: email,
    // Hora no assunto: dois pedidos seguidos não viram uma conversa só no Gmail.
    assunto: `Seu código de acesso — Commerly (${formatarHora(new Date())})`,
    html,
    texto,
  })

  if (envio.ok) {
    // Nunca logar o código: ele é a credencial de entrada na conta.
    console.log('[api/auth/enviar-codigo] Resend aceitou — id:', envio.id)
    return OK()
  }

  // Plano B: o envio antigo, pelo SMTP do Supabase. Gera um código NOVO (o do
  // generateLink acima deixa de valer), então só usamos quando o Resend falhou.
  console.error('[api/auth/enviar-codigo] Resend falhou, tentando o SMTP do Supabase:', envio.erro)
  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { error: errSupabase } = await anon.auth.signInWithOtp({ email, options: { shouldCreateUser: false } })
  if (errSupabase) {
    console.error('[api/auth/enviar-codigo] SMTP do Supabase também falhou:', errSupabase.message)
    return NextResponse.json({ erro: 'Não foi possível enviar o código agora. Tente novamente em instantes.' }, { status: 502 })
  }
  return OK()
}
