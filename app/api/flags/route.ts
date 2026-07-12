import { NextResponse } from 'next/server'
import { createAdminClient } from '../../lib/supabase-admin'
import { supabaseDaRota, usuarioDaRota } from '../../lib/rotaSupabase'
import { flagsDoUsuario } from '../../lib/featureFlags'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Flags efetivas para o app do usuário logado (global + overrides da cidade).
// Fonte única do gating no cliente: gamificação, fundadores, etc.
export async function GET() {
  const supabase = await supabaseDaRota()
  const user = await usuarioDaRota(supabase).catch(() => null)
  const admin = createAdminClient()
  const flags = await flagsDoUsuario(user?.id, admin)
  return NextResponse.json({ flags })
}
