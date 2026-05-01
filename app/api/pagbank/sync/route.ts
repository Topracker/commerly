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
  const { data: conexao } = await admin
    .from('pagbank_conexoes')
    .select('token')
    .eq('loja_id', loja.id)
    .single()

  if (!conexao) return NextResponse.json({ error: 'PagBank não conectado' }, { status: 400 })

  const desde = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const pbRes = await fetch(
    `https://api.pagseguro.com/orders?created_at_gte=${encodeURIComponent(desde)}&page_size=100`,
    { headers: { Authorization: `Bearer ${conexao.token}` } }
  )

  if (!pbRes.ok) {
    console.error('[PagBank sync] orders fetch error:', await pbRes.text())
    return NextResponse.json({ error: 'Falha ao buscar ordens do PagBank' }, { status: 500 })
  }

  const { orders = [] } = await pbRes.json()
  let importadas = 0

  for (const order of orders) {
    for (const charge of order.charges ?? []) {
      if (charge.status !== 'PAID') continue

      const chargeId = String(charge.id ?? '')
      if (!chargeId) continue

      const { data: existente } = await admin
        .from('vendas')
        .select('id')
        .eq('pb_charge_id', chargeId)
        .maybeSingle()

      if (existente) continue

      const valor = (charge.amount?.value ?? 0) / 100
      const formaPagamento = resolverForma(charge.payment_method?.type ?? '')

      const { error } = await admin.from('vendas').insert({
        loja_id: loja.id,
        produto_id: null,
        descricao: charge.description || order.reference_id || 'Pagamento PagBank',
        quantidade: 1,
        valor_total: valor,
        lucro: 0,
        forma_pagamento: formaPagamento,
        origem: 'pagbank',
        pb_charge_id: chargeId,
      })

      if (!error) importadas++
    }
  }

  return NextResponse.json({ ok: true, importadas })
}

function resolverForma(type: string): string {
  switch (type.toUpperCase()) {
    case 'CREDIT_CARD': return 'Cartão de crédito'
    case 'DEBIT_CARD': return 'Cartão de débito'
    case 'PIX': return 'Pix'
    case 'BOLETO': return 'Boleto'
    default: return 'Maquininha'
  }
}
