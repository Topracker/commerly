import { NextRequest, NextResponse } from 'next/server'
import { createHmac } from 'crypto'
import { createAdminClient } from '../../../lib/supabase-admin'

const PRECO_NORMAL = 54.99
const CICLOS_PROMO = 2

export async function POST(request: NextRequest) {
  const rawBody = await request.text()

  const webhookSecret = process.env.MP_WEBHOOK_SECRET
  if (!webhookSecret) {
    console.error('[assinatura-webhook] MP_WEBHOOK_SECRET não configurada — requisição recusada')
    return NextResponse.json({ ok: false }, { status: 500 })
  }

  const signature = request.headers.get('x-signature') ?? ''
  const requestId = request.headers.get('x-request-id') ?? ''
  if (!verificarAssinatura(rawBody, signature, requestId, webhookSecret)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let body: any
  try {
    body = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 })
  }

  const { type, data } = body
  const supabase = createAdminClient()

  // Cancelamento via painel do Mercado Pago
  if (type === 'subscription_preapproval' && data?.id) {
    const subRes = await fetch(`https://api.mercadopago.com/preapproval/${data.id}`, {
      headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` },
    })
    if (!subRes.ok) return NextResponse.json({ ok: false }, { status: 502 })

    const sub = await subRes.json()
    if (sub.status === 'cancelled') {
      await supabase
        .from('lojas')
        .update({ plano: 'inativo', mp_assinatura_id: null, assinatura_ciclos: 0 })
        .eq('mp_assinatura_id', data.id)
    }
    return NextResponse.json({ ok: true })
  }

  if (type !== 'payment' || !data?.id) return NextResponse.json({ ok: true })

  const pagRes = await fetch(`https://api.mercadopago.com/v1/payments/${data.id}`, {
    headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` },
  })
  if (!pagRes.ok) return NextResponse.json({ ok: false }, { status: 502 })

  const pagamento = await pagRes.json()

  // Só processa pagamentos aprovados de assinaturas recorrentes
  if (pagamento.status !== 'approved') return NextResponse.json({ ok: true })
  if (!pagamento.subscription_id) return NextResponse.json({ ok: true })

  const lojaId = pagamento.external_reference
  if (!lojaId) return NextResponse.json({ ok: false }, { status: 400 })

  const { data: loja } = await supabase
    .from('lojas')
    .select('fundador, assinatura_ciclos')
    .eq('id', lojaId)
    .single()

  if (!loja) return NextResponse.json({ ok: false }, { status: 404 })

  const novosCiclos = (loja.assinatura_ciclos || 0) + 1

  // Ativa o plano e salva o ID da assinatura — apenas aqui, após pagamento confirmado
  await supabase
    .from('lojas')
    .update({
      plano: 'ativo',
      mp_assinatura_id: pagamento.subscription_id,
      assinatura_ciclos: novosCiclos,
    })
    .eq('id', lojaId)

  // Fundador: após 2 ciclos promocionais, atualiza o preapproval para o preço normal
  if (loja.fundador && novosCiclos >= CICLOS_PROMO) {
    await fetch(`https://api.mercadopago.com/preapproval/${pagamento.subscription_id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        auto_recurring: { transaction_amount: PRECO_NORMAL },
      }),
    }).catch(e => console.error('[assinatura-webhook] upgrade preço error:', e))
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
    const dataId = JSON.parse(body)?.data?.id ?? ''
    const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`
    const computed = createHmac('sha256', secret).update(manifest).digest('hex')
    return computed === v1
  } catch {
    return false
  }
}
