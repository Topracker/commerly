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

  const body = await request.json().catch(() => null)
  const email: string = body?.email?.trim() ?? ''
  const token: string = body?.token?.trim() ?? ''
  if (!email || !token) {
    return NextResponse.json({ error: 'Email e token são obrigatórios' }, { status: 400 })
  }

  const pbRes = await fetch('https://api.pagseguro.com/orders?page_size=1', {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!pbRes.ok) {
    return NextResponse.json({ error: 'Token inválido ou sem permissão na API do PagBank' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('pagbank_conexoes')
    .upsert({ loja_id: loja.id, email, token }, { onConflict: 'loja_id' })

  if (error) {
    console.error('[PagBank connect] upsert error:', error)
    return NextResponse.json({ error: 'Falha ao salvar credenciais' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
