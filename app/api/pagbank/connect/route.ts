import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '../../../lib/supabase-admin'
import { rateLimit } from '../../../lib/rate-limit'

function getPagBankBaseUrl(ambiente: string): string {
  return ambiente === 'sandbox'
    ? 'https://sandbox.api.pagseguro.com'
    : 'https://api.pagseguro.com'
}

export async function POST(request: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!rateLimit(`pb-connect:${user.id}`, 5, 60_000)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const { data: loja } = await supabase
    .from('lojas')
    .select('id')
    .eq('user_id', user.id)
    .single()
  if (!loja) return NextResponse.json({ error: 'Loja não encontrada' }, { status: 404 })

  const body = await request.json().catch(() => null)
  const email: string = body?.email?.trim() ?? ''
  const token: string = body?.token?.trim() ?? ''
  const ambiente: string = body?.ambiente === 'sandbox' ? 'sandbox' : 'producao'
  if (!email || !token) {
    return NextResponse.json({ error: 'Email e token são obrigatórios' }, { status: 400 })
  }

  // Valida o token com POST /public-keys: 201 = token válido, qualquer outra resposta = inválido.
  // A API do PagBank não tem endpoint de listagem de pedidos por data, então não dá pra validar
  // por /orders (ele retorna 400 mesmo com token válido). /public-keys é o jeito confiável.
  const pbRes = await fetch(`${getPagBankBaseUrl(ambiente)}/public-keys`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'card' }),
  })
  if (!pbRes.ok) {
    const pbBody = await pbRes.text().catch(() => '')
    console.error('[PagBank connect] validação do token falhou', { status: pbRes.status, body: pbBody.slice(0, 300), ambiente })
    return NextResponse.json({ error: 'Token inválido ou sem permissão na API do PagBank' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('pagbank_conexoes')
    .upsert({ loja_id: loja.id, email, token, ambiente }, { onConflict: 'loja_id' })

  if (error) {
    console.error('[PagBank connect] upsert error:', error)
    return NextResponse.json({ error: 'Falha ao salvar credenciais' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
