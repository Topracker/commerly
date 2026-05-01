import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '../../../lib/supabase-admin'

export async function POST(request: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: loja } = await supabase
    .from('lojas')
    .select('id')
    .eq('user_id', user.id)
    .single()
  if (!loja) return NextResponse.json({ error: 'Loja não encontrada' }, { status: 404 })

  const admin = createAdminClient()
  const { error } = await admin
    .from('pagbank_conexoes')
    .delete()
    .eq('loja_id', loja.id)

  if (error) {
    console.error('[PagBank disconnect] error:', error)
    return NextResponse.json({ error: 'Falha ao desconectar' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
