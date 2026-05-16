import { NextResponse } from 'next/server'
import { createAdminClient } from '../../../lib/supabase-admin'

export async function GET() {
  const supabase = createAdminClient()

  const { count } = await supabase
    .from('lojas')
    .select('id', { count: 'exact', head: true })
    .eq('fundador', true)

  const vagasRestantes = Math.max(0, 100 - (count ?? 0))
  return NextResponse.json({ vagasRestantes })
}
