import { NextResponse } from 'next/server'
import { createAdminClient } from '../../../lib/supabase-admin'
import { supabaseDaRota, usuarioDaRota } from '../../../lib/rotaSupabase'
import { reconciliarUsuario } from '../../../lib/gamificacaoServer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Reconcilia XP/missões/medalhas/streak do usuário logado e devolve o perfil.
export async function GET() {
  const supabase = await supabaseDaRota()
  const user = await usuarioDaRota(supabase)
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const admin = createAdminClient()
  try {
    const perfil = await reconciliarUsuario(admin, user.id)
    if (!perfil) return NextResponse.json({ error: 'Perfil não encontrado' }, { status: 404 })
    return NextResponse.json(perfil)
  } catch (e) {
    console.error('[gamificacao/sync] erro:', e)
    return NextResponse.json({ error: 'Falha ao sincronizar.' }, { status: 500 })
  }
}
