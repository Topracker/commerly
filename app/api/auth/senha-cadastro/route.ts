import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '../../../lib/supabase-admin'
import { rateLimit } from '../../../lib/rate-limit'

// Fallback de cadastro por senha — cria o usuário já com e-mail confirmado
// via Admin API, sem disparar nenhum e-mail. Serve como alternativa ao OTP
// quando o envio de e-mail (SMTP) está indisponível.
export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'
  if (!rateLimit(`senha-cadastro:${ip}`, 5, 60_000)) {
    return NextResponse.json({ erro: 'Muitas tentativas. Aguarde alguns minutos.' }, { status: 429 })
  }

  try {
    const { email, senha } = await req.json()
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!email || !emailRegex.test(email)) {
      return NextResponse.json({ erro: 'Email inválido' }, { status: 400 })
    }
    if (!senha || typeof senha !== 'string' || senha.length < 6) {
      return NextResponse.json({ erro: 'A senha deve ter ao menos 6 caracteres.' }, { status: 400 })
    }

    const admin = createAdminClient()
    const { error } = await admin.auth.admin.createUser({
      email,
      password: senha,
      email_confirm: true,
    })

    if (error) {
      const msg = error.message.toLowerCase()
      if (msg.includes('already') || msg.includes('registered') || msg.includes('exists')) {
        return NextResponse.json({ erro: 'Este e-mail já está cadastrado. Faça login.' }, { status: 409 })
      }
      console.error('[senha-cadastro] createUser error:', error.message)
      return NextResponse.json({ erro: 'Não foi possível criar a conta.' }, { status: 400 })
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[senha-cadastro] exception:', e)
    return NextResponse.json({ erro: 'Erro interno' }, { status: 500 })
  }
}
