import { NextRequest, NextResponse } from 'next/server'
import { createHmac } from 'crypto'
import { createAdminClient } from '../../../lib/supabase-admin'

export async function POST(request: NextRequest) {
  const rawBody = await request.text()

  // Log imediato para confirmar que o MP está chegando — aparece no Vercel antes de qualquer validação
  console.log('[MP webhook] chamado', {
    xSignature: request.headers.get('x-signature')?.slice(0, 40) ?? '(ausente)',
    xRequestId: request.headers.get('x-request-id') ?? '(ausente)',
    contentType: request.headers.get('content-type') ?? '(ausente)',
    bodyPreview: rawBody.slice(0, 120),
  })

  const webhookSecret = process.env.MP_WEBHOOK_SECRET
  if (!webhookSecret) {
    console.error('[MP webhook] MP_WEBHOOK_SECRET não configurada')
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 })
  }

  const signature = request.headers.get('x-signature') ?? ''
  const requestId = request.headers.get('x-request-id') ?? ''

  if (!verificarAssinatura(rawBody, signature, requestId, webhookSecret)) {
    console.error('[MP webhook] assinatura inválida', {
      signature: signature.slice(0, 60),
      requestId,
      bodyPreview: rawBody.slice(0, 80),
    })
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let notification: any
  try {
    notification = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  if (notification.type !== 'payment') {
    console.log('[MP webhook] tipo ignorado:', notification.type)
    return NextResponse.json({ ok: true })
  }

  const mpUserId = String(notification.user_id ?? '')
  const paymentId = String(notification.data?.id ?? '')

  if (!mpUserId || !paymentId) {
    console.error('[MP webhook] campos ausentes', { mpUserId, paymentId, notification })
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const supabase = createAdminClient()

  const { data: conexao, error: conexaoErr } = await supabase
    .from('mercadopago_conexoes')
    .select('loja_id, access_token')
    .eq('mp_user_id', mpUserId)
    .single()

  if (conexaoErr || !conexao) {
    console.error('[MP webhook] merchant não encontrado para mp_user_id:', mpUserId, conexaoErr)
    return NextResponse.json({ ok: true })
  }

  const { data: existente } = await supabase
    .from('vendas')
    .select('id')
    .eq('mp_payment_id', paymentId)
    .maybeSingle()

  if (existente) {
    console.log('[MP webhook] pagamento já registrado:', paymentId)
    return NextResponse.json({ ok: true })
  }

  const pagRes = await fetch(
    `https://api.mercadopago.com/v1/payments/${paymentId}`,
    { headers: { Authorization: `Bearer ${conexao.access_token}` } }
  )

  if (!pagRes.ok) {
    const errText = await pagRes.text()
    if (pagRes.status === 404) {
      // Pagamento não encontrado — simulação do painel ou ID inválido, ignora silenciosamente
      console.warn('[MP webhook] pagamento nao encontrado (404), ignorando:', paymentId)
      return NextResponse.json({ ok: true })
    }
    console.error('[MP webhook] erro ao buscar pagamento:', paymentId, errText)
    return NextResponse.json({ error: 'Failed to fetch payment' }, { status: 500 })
  }

  const pag = await pagRes.json()

  if (pag.status !== 'approved') {
    console.log('[MP webhook] pagamento não aprovado:', paymentId, 'status:', pag.status)
    return NextResponse.json({ ok: true })
  }

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
    console.error('[MP webhook] erro ao salvar venda:', error)
    return NextResponse.json({ error: 'Failed to save sale' }, { status: 500 })
  }

  console.log('[MP webhook] venda salva:', { paymentId, lojaId: conexao.loja_id, valor: pag.transaction_amount })
  return NextResponse.json({ ok: true })
}

function verificarAssinatura(
  body: string,
  signature: string,
  requestId: string,
  secret: string
): boolean {
  try {
    // .trim() evita falha caso o MP envie espaços após vírgulas (ex: "ts=123, v1=abc")
    const parts = Object.fromEntries(
      signature.split(',').map(p => {
        const idx = p.indexOf('=')
        return [p.slice(0, idx).trim(), p.slice(idx + 1).trim()] as [string, string]
      })
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
    case 'bank_transfer': return 'Pix'
    case 'account_money': return 'Carteira MP'
    case 'ticket': return 'Boleto'
    default: return 'Maquininha'
  }
}
