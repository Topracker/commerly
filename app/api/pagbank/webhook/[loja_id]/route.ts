import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '../../../../lib/supabase-admin'

function getPagBankBaseUrl(ambiente: string): string {
  return ambiente === 'sandbox'
    ? 'https://sandbox.api.pagseguro.com'
    : 'https://api.pagseguro.com'
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ loja_id: string }> }
) {
  const { loja_id } = await params

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const eventType: string = body.event_type ?? ''
  if (!eventType.toUpperCase().includes('PAID') && !eventType.toUpperCase().includes('COMPLETED')) {
    return NextResponse.json({ ok: true })
  }

  const chargeId = String(body.data?.id ?? '')
  if (!chargeId) return NextResponse.json({ ok: true })

  const supabase = createAdminClient()

  const { data: conexao } = await supabase
    .from('pagbank_conexoes')
    .select('token, ambiente')
    .eq('loja_id', loja_id)
    .single()

  if (!conexao) return NextResponse.json({ ok: true })

  // Verify charge against PagBank API — prevents fake webhook injection
  const pbVerify = await fetch(
    `${getPagBankBaseUrl(conexao.ambiente ?? 'producao')}/charges/${chargeId}`,
    { headers: { Authorization: `Bearer ${conexao.token}` } }
  )

  if (!pbVerify.ok) {
    console.error('[PagBank webhook] charge verification failed:', chargeId)
    return NextResponse.json({ ok: true })
  }

  const verifiedCharge = await pbVerify.json()
  if (verifiedCharge.status !== 'PAID') return NextResponse.json({ ok: true })

  const { data: existente } = await supabase
    .from('vendas')
    .select('id')
    .eq('pb_charge_id', chargeId)
    .maybeSingle()

  if (existente) return NextResponse.json({ ok: true })

  const valor = (verifiedCharge.amount?.value ?? 0) / 100
  const formaPagamento = resolverForma(verifiedCharge.payment_method?.type ?? '')

  const { error } = await supabase.from('vendas').insert({
    loja_id,
    produto_id: null,
    descricao: verifiedCharge.description || 'Pagamento PagBank',
    quantidade: 1,
    valor_total: valor,
    lucro: 0,
    forma_pagamento: formaPagamento,
    origem: 'pagbank',
    pb_charge_id: chargeId,
  })

  if (error) {
    console.error('[PagBank webhook] insert error:', error)
    return NextResponse.json({ error: 'Failed to save sale' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
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
