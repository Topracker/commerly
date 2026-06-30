import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '../../../lib/supabase-admin'
import { rateLimit } from '../../../lib/rate-limit'

// Anti-spam básico: no máximo 1 conta criada por dia por endereço IP, em
// qualquer área (comerciante / cliente / fornecedor). Chamado pelo client
// logo antes de inserir o perfil. Registra o IP numa tabela e bloqueia se já
// houver criação nas últimas 24h.

const UM_DIA_MS = 24 * 60 * 60 * 1000

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'

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

  if (!rateLimit(`registrar-ip:${ip}`, 20, 60_000)) {
    return NextResponse.json({ erro: 'Muitas tentativas. Aguarde um momento.' }, { status: 429 })
  }

  const body = await req.json().catch(() => null)
  const area = typeof body?.area === 'string' ? body.area.slice(0, 20) : null

  const admin = createAdminClient()
  const desde = new Date(Date.now() - UM_DIA_MS).toISOString()

  const { count, error } = await admin
    .from('cadastro_ips')
    .select('id', { count: 'exact', head: true })
    .eq('ip', ip)
    .gte('criado_em', desde)

  // Falha "aberta": se a tabela ainda não existe (SQL não rodado) ou houve
  // erro de infra, não bloqueamos cadastro legítimo.
  if (error) {
    console.error('[registrar-ip] erro ao consultar cadastro_ips:', error.message)
    return NextResponse.json({ ok: true })
  }

  if ((count ?? 0) >= 1) {
    return NextResponse.json(
      { erro: 'Já foi criada uma conta a partir desta rede hoje. Tente novamente amanhã.' },
      { status: 429 }
    )
  }

  const { error: insErr } = await admin.from('cadastro_ips').insert({ ip, area })
  if (insErr) console.error('[registrar-ip] erro ao registrar IP:', insErr.message)

  return NextResponse.json({ ok: true })
}
