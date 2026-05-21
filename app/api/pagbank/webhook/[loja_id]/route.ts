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

  // O PagBank envia o objeto completo da order (mesmo formato do response síncrono
  // da API), com um array `charges` — NÃO existe campo `event_type` nem `data.id`.
  // Por segurança, também tratamos o caso de um charge isolado chegar no corpo.
  const charges: any[] = Array.isArray(body.charges)
    ? body.charges
    : body.id && body.status
      ? [body]
      : []

  const pagas = charges.filter((c) => String(c?.status).toUpperCase() === 'PAID')
  if (pagas.length === 0) {
    return NextResponse.json({ ok: true })
  }

  const supabase = createAdminClient()

  const { data: conexao } = await supabase
    .from('pagbank_conexoes')
    .select('token, ambiente')
    .eq('loja_id', loja_id)
    .single()

  if (!conexao) return NextResponse.json({ ok: true })

  const baseUrl = getPagBankBaseUrl(conexao.ambiente ?? 'producao')
  let registradas = 0

  for (const charge of pagas) {
    const chargeId = String(charge.id ?? '')
    if (!chargeId) continue

    // Verifica a cobrança direto na API do PagBank — impede injeção de webhook falso
    const pbVerify = await fetch(
      `${baseUrl}/charges/${chargeId}`,
      { headers: { Authorization: `Bearer ${conexao.token}` } }
    )

    if (!pbVerify.ok) {
      console.error('[PagBank webhook] charge verification failed:', chargeId)
      continue
    }

    const verifiedCharge = await pbVerify.json()
    if (verifiedCharge.status !== 'PAID') continue

    const { data: existente } = await supabase
      .from('vendas')
      .select('id')
      .eq('pb_charge_id', chargeId)
      .maybeSingle()

    if (existente) continue

    const valor = (verifiedCharge.amount?.value ?? 0) / 100
    const formaPagamento = resolverForma(verifiedCharge.payment_method?.type ?? '')

    const { error } = await supabase.from('vendas').insert({
      loja_id,
      produto_id: null,
      descricao: formaPagamento,
      quantidade: 1,
      valor_total: valor,
      lucro: 0,
      forma_pagamento: formaPagamento,
      origem: 'pagbank',
      pb_charge_id: chargeId,
    })

    if (error) {
      console.error('[PagBank webhook] insert error:', error)
      continue
    }
    registradas++
  }

  return NextResponse.json({ ok: true, registradas })
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
