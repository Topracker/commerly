import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '../../../lib/supabase-admin'

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json()
    if (!email) return NextResponse.json({ erro: 'Email obrigatório' }, { status: 400 })

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
