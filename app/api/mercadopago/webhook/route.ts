import { NextRequest, NextResponse } from 'next/server'
import { createHmac } from 'crypto'
import { createAdminClient } from '../../../lib/supabase-admin'

export async function POST(request: NextRequest) {
  const rawBody = await request.text()

  // Verify signature when MP_WEBHOOK_SECRET is configured
  const webhookSecret = process.env.MP_WEBHOOK_SECRET
  if (webhookSecret) {
    const signature = request.headers.get('x-signature') ?? ''
    const requestId = request.headers.get('x-request-id') ?? ''
    if (!verificarAssinatura(rawBody, signature, requestId, webhookSecret)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }
  }

  let notification: any
  try {
    notification = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  // Only handle payment notifications
  if (notification.type !== 'payment') {
    return NextResponse.json({ ok: true })
  }

  const mpUserId = String(notification.user_id ?? '')
  const paymentId = String(notification.data?.id ?? '')
  if (!mpUserId || !paymentId) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const supabase = createAdminClient()

  const { data: conexao } = await supabase
    .from('mercadopago_conexoes')
    .select('loja_id, access_token')
    .eq('mp_user_id', mpUserId)
    .single()

  if (!conexao) return NextResponse.json({ ok: true })

  // Avoid duplicates
  const { data: existente } = await supabase
    .from('vendas')
    .select('id')
    .eq('mp_payment_id', paymentId)
    .maybeSingle()

  if (existente) return NextResponse.json({ ok: true })

  const pagRes = await fetch(
    `https://api.mercadopago.com/v1/payments/${paymentId}`,
    { headers: { Authorization: `Bearer ${conexao.access_token}` } }
  )

  if (!pagRes.ok) {
    console.error('[MP webhook] payment fetch error:', await pagRes.text())
    return NextResponse.json({ error: 'Failed to fetch payment' }, { status: 500 })
  }

  const pag = await pagRes.json()

  if (pag.status !== 'approved') return NextResponse.json({ ok: true })

  const formaPagamento = resolverFormaPagamento(pag.payment_type_id)

  const { error } = await supabase.from('vendas').insert({
    loja_id: conexao.loja_id,
    produto_id: null,
    descricao: pag.description || 'Pagamento Mercado Pago',
    quantidade: 1,
    valor_total: pag.transaction_amount,
    lucro: 0,
    forma_pagamento: formaPagamento,
    origem: 'mercadopago',
    mp_payment_id: paymentId,
  })

  if (error) {
    console.error('[MP webhook] insert error:', error)
    return NextResponse.json({ error: 'Failed to save sale' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

function verificarAssinatura(
  body: string,
  signature: string,
  requestId: string,
  secret: string
): boolean {
  try {
    const parts = Object.fromEntries(
      signature.split(',').map(p => p.split('=') as [string, string])
    )
    const ts = parts['ts']
    const v1 = parts['v1']
    if (!ts || !v1) return false
    const paymentId = JSON.parse(body)?.data?.id ?? ''
    const manifest = `id:${paymentId};request-id:${requestId};ts:${ts};`
    const computed = createHmac('sha256', secret).update(manifest).digest('hex')
    return computed === v1
  } catch {
    return false
  }
}

function resolverFormaPagamento(type: string): string {
  switch (type) {
    case 'credit_card': return 'Cartão de crédito'
    case 'debit_card': return 'Cartão de débito'
    case 'account_money': return 'Pix'
    case 'ticket': return 'Boleto'
    default: return 'Maquininha'
  }
}
