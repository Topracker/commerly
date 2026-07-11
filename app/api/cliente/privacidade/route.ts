import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '../../../lib/supabase-admin'
import { supabaseDaRota, usuarioDaRota } from '../../../lib/rotaSupabase'
import { perfilSlug } from '../../../lib/crescimento'

export const runtime = 'nodejs'

// GET: estado atual do perfil público do cliente + slug.
export async function GET() {
  const supabase = await supabaseDaRota()
  const user = await usuarioDaRota(supabase)
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const admin = createAdminClient()
  const { data: cli } = await admin.from('clientes').select('id, nome, perfil_privado').eq('user_id', user.id).maybeSingle()
  if (!cli) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })
  return NextResponse.json({ privado: !!cli.perfil_privado, slug: perfilSlug(cli.nome, cli.id) })
}

// POST { privado: boolean }: atualiza a preferência de privacidade.
export async function POST(request: NextRequest) {
  const supabase = await supabaseDaRota()
  const user = await usuarioDaRota(supabase)
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const body = await request.json().catch(() => ({}))
  const privado = !!body?.privado
  const admin = createAdminClient()
  const { error } = await admin.from('clientes').update({ perfil_privado: privado }).eq('user_id', user.id)
  if (error) return NextResponse.json({ error: 'Falha ao salvar.' }, { status: 500 })
  return NextResponse.json({ ok: true, privado })
}
