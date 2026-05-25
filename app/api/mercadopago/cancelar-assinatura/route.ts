import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createAdminClient } from '../../../lib/supabase-admin'
import { cookies } from 'next/headers'
import { rateLimit } from '../../../lib/rate-limit'

export async function POST(request: NextRequest) {
  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll() {},
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  if (!rateLimit(`mp-cancelar:${user.id}`, 3, 60_000)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const { data: loja } = await supabase
    .from('lojas')
    .select('id, mp_assinatura_id')
    .eq('user_id', user.id)
    .single()

  if (!loja?.mp_assinatura_id) {
    return NextResponse.json({ error: 'Nenhuma assinatura ativa encontrada' }, { status: 400 })
  }

  const res = await fetch(`https://api.mercadopago.com/preapproval/${loja.mp_assinatura_id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({ status: 'cancelled' }),
  })

  if (!res.ok) {
    console.error('[cancelar] MP error:', await res.text())
    return NextResponse.json({ error: 'Erro ao cancelar no Mercado Pago' }, { status: 502 })
  }

  const admin = createAdminClient()
  await admin
    .from('lojas')
    .update({ plano: 'inativo', mp_assinatura_id: null, assinatura_ciclos: 0 })
    .eq('id', loja.id)

  return NextResponse.json({ ok: true })
}
