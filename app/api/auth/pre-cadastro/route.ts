import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '../../../lib/supabase-admin'
import { rateLimit } from '../../../lib/rate-limit'

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'
  if (!rateLimit(`pre-cadastro:${ip}`, 5, 60_000)) {
    return NextResponse.json({ erro: 'Muitas tentativas. Aguarde alguns minutos.' }, { status: 429 })
  }

  try {
    const { email } = await req.json()
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!email || !emailRegex.test(email)) return NextResponse.json({ erro: 'Email inválido' }, { status: 400 })

    const admin = createAdminClient()
    const { error } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
    })

    // Usuário já existe: tudo bem, o signInWithOtp vai enviar OTP normalmente
    if (error && !error.message.toLowerCase().includes('already')) {
      return NextResponse.json({ erro: error.message }, { status: 400 })
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ erro: 'Erro interno' }, { status: 500 })
  }
}
