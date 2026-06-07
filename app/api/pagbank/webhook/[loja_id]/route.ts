import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '../../../../lib/supabase-admin'
import { rateLimit } from '../../../../lib/rate-limit'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// Limite de cobranças verificadas por requisição — evita amplificação de
// chamadas à API do PagBank a partir de um webhook forjado com muitos charges.
const MAX_CHARGES = 50

function getPagBankBaseUrl(ambiente: string): string {
  return ambiente === 'sandbox'
    ? 'https://sandbox.api.pagseguro.com'
    : 'https://api.pagseguro.com'
}

export async function GET() {
  return NextResponse.json({ ok: true })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ loja_id: string }> }
) {
  const { loja_id } = await params

  // Rejeita loja_id malformado antes de qualquer trabalho
  if (!UUID_RE.test(loja_id)) {
    return NextResponse.json({ error: 'Invalid loja_id' }, { status: 400 })
  }

  // Endpoint público (PagBank não assina o webhook) — limita a taxa por loja
  // para conter abuso/amplificação. A verificação de cada charge na API do
  // PagBank continua sendo a defesa principal contra injeção de vendas falsas.
  if (!rateLimit(`pb-webhook:${loja_id}`, 120, 60_000)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

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

  const pagas = charges
    .filter((c) => String(c?.status).toUpperCase() === 'PAID')
    .slice(0, MAX_CHARGES)
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
