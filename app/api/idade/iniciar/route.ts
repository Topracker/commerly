import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { rateLimit } from '../../../lib/rate-limit'
import { criarSessaoDidit, diditConfigurado } from '../../../lib/didit'
import { idadeVerificada } from '../../../lib/restritos'

// Inicia a verificação de idade (documento + selfie) do cliente logado.
export async function POST(request: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } },
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (!rateLimit(`idade-iniciar:${user.id}`, 5, 10 * 60_000)) {
    return NextResponse.json({ error: 'Muitas tentativas. Aguarde alguns minutos.' }, { status: 429 })
  }
  if (idadeVerificada(user)) return NextResponse.json({ error: 'Sua idade já foi verificada.' }, { status: 409 })
  if (!diditConfigurado()) {
    return NextResponse.json({ error: 'A verificação de idade ainda não está disponível. Tente mais tarde.' }, { status: 503 })
  }

  const body = await request.json().catch(() => ({}))
  // Selfie + documento são dado biométrico (LGPD): exige consentimento explícito.
  if (body?.consentimento !== true) {
    return NextResponse.json({ error: 'É preciso concordar com o envio do documento e da selfie.' }, { status: 400 })
  }

  const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin
  const r = await criarSessaoDidit(user.id, `${origin}/cliente/verificar-idade?retorno=1`)
  if ('erro' in r) return NextResponse.json({ error: r.erro }, { status: 502 })
  return NextResponse.json({ url: r.url })
}
