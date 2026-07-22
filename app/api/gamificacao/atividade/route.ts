import { NextResponse } from 'next/server'
import { createAdminClient } from '../../../lib/supabase-admin'
import { supabaseDaRota, usuarioDaRota } from '../../../lib/rotaSupabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Atividade diária do usuário logado — alimenta a grade estilo GitHub do
// streak. As linhas nascem dos gatilhos de gamificação
// (sql/2026-07-22-xp-streak-kit.sql), não do app.
//
// Devolve os últimos 371 dias (53 semanas cheias) para a grade fechar em
// colunas completas de domingo a sábado.
const DIAS = 371

export async function GET() {
  const supabase = await supabaseDaRota()
  const user = await usuarioDaRota(supabase)
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const admin = createAdminClient()
  const desde = new Date()
  desde.setHours(0, 0, 0, 0)
  desde.setDate(desde.getDate() - (DIAS - 1))

  const [{ data: dias }, { data: streak }] = await Promise.all([
    admin.from('atividade_dias')
      .select('dia, eventos')
      .eq('user_id', user.id)
      .gte('dia', desde.toISOString().slice(0, 10))
      .order('dia', { ascending: true }),
    admin.from('streaks').select('dias, recorde, ultimo_dia').eq('user_id', user.id).maybeSingle(),
  ])

  return NextResponse.json({
    dias: dias || [],
    streak: { dias: streak?.dias || 0, recorde: streak?.recorde || 0, ultimo_dia: streak?.ultimo_dia || null },
  })
}
