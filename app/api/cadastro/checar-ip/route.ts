import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { rateLimit } from '../../../lib/rate-limit'
import {
  LIMITE_CADASTROS_POR_DIA, contarCadastrosDoIp, ipDoRequest, msgLimiteAtingido,
} from '../../../lib/cadastroIp'

// Etapa 1 do limite por IP (ver app/lib/cadastroIp.ts): SÓ CONTA. Chamado
// pelo client antes de inserir o perfil; não grava nada, então um insert que
// falhe depois não queima o IP.

export async function POST(req: NextRequest) {
  const ip = ipDoRequest(req)

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 })

  // Sem IP confiável (ex: ambiente local) não há como limitar — libera.
  if (ip === 'unknown') return NextResponse.json({ ok: true })

  // Burst (achado A3): 20 chamadas/min por IP, independente do limite diário.
  if (!rateLimit(`registrar-ip:${ip}`, 20, 60_000)) {
    return NextResponse.json({ erro: 'Muitas tentativas. Aguarde um momento.' }, { status: 429 })
  }

  const total = await contarCadastrosDoIp(ip)
  if (total === null) return NextResponse.json({ ok: true })

  if (total >= LIMITE_CADASTROS_POR_DIA) {
    return NextResponse.json({ erro: msgLimiteAtingido() }, { status: 429 })
  }
  return NextResponse.json({ ok: true, restantes: LIMITE_CADASTROS_POR_DIA - total })
}
