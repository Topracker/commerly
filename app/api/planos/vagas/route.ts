import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '../../../lib/supabase-admin'
import { rateLimit } from '../../../lib/rate-limit'
import { VAGAS_FUNDADOR } from '../../../lib/precos'

export async function GET(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'
  if (!rateLimit(`planos-vagas:${ip}`, 20, 60_000)) {
    return NextResponse.json({ vagasRestantes: null }, { status: 429 })
  }

  const supabase = createAdminClient()

  // `fundador_vagas` é o registro permanente (sql/2026-10-25-fundador-dois-meses.sql):
  // loja apagada continua ocupando a vaga. Contar `lojas.fundador` devolvia a
  // vaga a cada exclusão.
  const { count } = await supabase
    .from('fundador_vagas')
    .select('ordem', { count: 'exact', head: true })

  const vagasRestantes = Math.max(0, VAGAS_FUNDADOR - (count ?? 0))
  return NextResponse.json({ vagasRestantes })
}
