import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '../../../lib/supabase-admin'
import { rateLimit } from '../../../lib/rate-limit'

export async function GET(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'
  if (!rateLimit(`planos-vagas:${ip}`, 20, 60_000)) {
    return NextResponse.json({ vagasRestantes: null }, { status: 429 })
  }

  const supabase = createAdminClient()

  const { count } = await supabase
    .from('lojas')
    .select('id', { count: 'exact', head: true })
    .eq('fundador', true)

  const vagasRestantes = Math.max(0, 100 - (count ?? 0))
  return NextResponse.json({ vagasRestantes })
}
