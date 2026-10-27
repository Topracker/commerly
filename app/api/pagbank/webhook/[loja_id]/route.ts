import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '../../../../lib/supabase-admin'
import { rateLimit } from '../../../../lib/rate-limit'
import { integracoesAtivas } from '../../../../lib/plano'
import {
  decodificarResposta,
  formaPagamentoPagBank,
  lerAvisoFormulario,
  parseTransacaoPagBank,
  statusGravaVenda,
  urlConsultaNotificacao,
} from '../../../../lib/pagbankNotificacao'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// Charge ID do PagBank: prefixo CHAR_ + ULID/UUID. Restringe ao alfabeto seguro
// para uso direto em URL e impede SSRF / path traversal via charge_id forjado.
const CHARGE_ID_RE = /^[A-Z0-9_\-]{1,80}$/i
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

  const corpo = await request.text()

  // Aviso de transação (formulário com notificationCode) — o que chega das
  // vendas que a Commerly não criou pela API, como as da maquininha.
  const aviso = lerAvisoFormulario(corpo, request.headers.get('content-type') ?? '')
  if (aviso) {
    if (!aviso.ok) return NextResponse.json({ error: aviso.motivo }, { status: 400 })
    return processarAvisoFormulario(loja_id, aviso.notificationCode, aviso.notificationType)
  }

  let body: any
  try {
    body = JSON.parse(corpo)
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

  // PAYWALL: loja fora do plano tem a integração PAUSADA. A conexão fica salva
  // e as vendas voltam a entrar assim que ela regularizar.
  if (!(await integracoesAtivas(supabase, loja_id))) {
    console.log('[PagBank webhook] integração pausada (plano inativo) para a loja', loja_id)
    return NextResponse.json({ ok: true, pausado: true })
  }

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
    if (!chargeId || !CHARGE_ID_RE.test(chargeId)) continue

    // Verifica a cobrança direto na API do PagBank — impede injeção de webhook falso
    const pbVerify = await fetch(
      `${baseUrl}/charges/${encodeURIComponent(chargeId)}`,
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

/**
 * Aviso de formulário: consulta a transação no PagBank com o e-mail + token da
 * loja (nunca confia no corpo do aviso) e grava a venda paga.
 *
 * 200 quando processou, ignorou ou a venda já existia. Falha na consulta ou no
 * banco responde 5xx de propósito: o PagBank reenvia o aviso, e um 200 ali
 * perderia a venda para sempre.
 */
async function processarAvisoFormulario(loja_id: string, notificationCode: string, notificationType: string) {
  if (notificationType !== 'transaction') {
    return NextResponse.json({ ok: true, ignorado: notificationType || 'sem_tipo' })
  }

  const supabase = createAdminClient()

  // PAYWALL: mesma regra do caminho JSON.
  if (!(await integracoesAtivas(supabase, loja_id))) {
    console.log('[PagBank webhook] integração pausada (plano inativo) para a loja', loja_id)
    return NextResponse.json({ ok: true, pausado: true })
  }

  const { data: conexao } = await supabase
    .from('pagbank_conexoes')
    .select('email, token, ambiente')
    .eq('loja_id', loja_id)
    .maybeSingle()

  // A consulta v3 exige e-mail + token da conta — só a conexão por token
  // manual tem os dois (a do Connect guarda access_token, que a v3 não aceita).
  if (!conexao?.email || !conexao?.token) {
    console.warn('[PagBank webhook] aviso recebido sem e-mail/token na conexão da loja', loja_id)
    return NextResponse.json({ ok: true, sem_credencial: true })
  }

  const ambiente = conexao.ambiente === 'sandbox' ? 'sandbox' : 'producao'
  let xml: string
  try {
    const res = await fetch(urlConsultaNotificacao(ambiente, notificationCode, conexao.email, conexao.token), {
      headers: { Accept: 'application/xml' },
    })
    if (!res.ok) {
      // Sem logar a URL: ela carrega o token da loja.
      console.error('[PagBank webhook] consulta da notificação falhou', { loja_id, status: res.status })
      return NextResponse.json({ error: 'Consulta ao PagBank falhou' }, { status: 502 })
    }
    xml = decodificarResposta(await res.arrayBuffer(), res.headers.get('content-type') ?? '')
  } catch (e) {
    console.error('[PagBank webhook] erro de rede na consulta da notificação', loja_id, e)
    return NextResponse.json({ error: 'Consulta ao PagBank falhou' }, { status: 502 })
  }

  const transacao = parseTransacaoPagBank(xml)
  if (!transacao) {
    console.error('[PagBank webhook] XML da transação ilegível', { loja_id, inicio: xml.slice(0, 120) })
    return NextResponse.json({ error: 'Resposta do PagBank ilegível' }, { status: 502 })
  }

  if (!statusGravaVenda(transacao.status)) {
    return NextResponse.json({ ok: true, ignorado: `status_${transacao.status}` })
  }

  const { data: existente } = await supabase
    .from('vendas')
    .select('id')
    .eq('pb_charge_id', transacao.code)
    .maybeSingle()
  if (existente) return NextResponse.json({ ok: true, ja_existe: true })

  const formaPagamento = formaPagamentoPagBank(transacao.paymentMethodType)
  const { error } = await supabase.from('vendas').insert({
    loja_id,
    produto_id: null,
    descricao: formaPagamento,
    quantidade: 1,
    valor_total: transacao.grossAmount,
    lucro: 0,
    forma_pagamento: formaPagamento,
    origem: 'pagbank',
    pb_charge_id: transacao.code,
  })

  if (error) {
    // Dois avisos da mesma transação (status 3 e 4) podem correr juntos; se
    // houver índice único em pb_charge_id, o segundo cai aqui.
    if (error.code === '23505') return NextResponse.json({ ok: true, ja_existe: true })
    console.error('[PagBank webhook] insert error (aviso):', error)
    return NextResponse.json({ error: 'Falha ao gravar venda' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, registradas: 1 })
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
