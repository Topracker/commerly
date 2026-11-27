import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '../../../lib/supabase-admin'
import { rateLimit } from '../../../lib/rate-limit'
import { dispatchPushPedido } from '../../../lib/pushDispatch'
import { pagarCorrida, verificarBonusIndicacao } from '../../../lib/repasse'

// Entregador digita o código de 4 dígitos do cliente para confirmar a entrega.
// Confere o código, marca o pedido como 'entregue' e paga corrida + gorjeta via
// Stripe Connect (transfer para a conta do entregador, lib/repasse.ts) quando o
// pedido foi pago online. Em DINHEIRO (Caminho B, lib/acertos.ts) não há transfer: o entregador
// já cobrou o total na porta e ficou com a taxa; o guard marca
// `pagamento_corrida='pago'` e o trigger `acertos_gerar_na_entrega` registra o
// que ele deve repassar à loja (`acertos_dinheiro`).
export async function POST(request: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } },
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (!rateLimit(`entregador-confirmar:${user.id}`, 20, 60_000)) {
    return NextResponse.json({ error: 'Muitas tentativas. Aguarde um instante.' }, { status: 429 })
  }

  const { pedido_id, codigo, comprovante_url } = await request.json().catch(() => ({}))
  if (!pedido_id || !codigo) return NextResponse.json({ error: 'Informe o pedido e o código.' }, { status: 400 })
  // Comprovante de entrega (foto tirada pelo entregador) — opcional. Aceita só
  // URL pública do nosso storage; qualquer outra coisa é ignorada.
  const comprovante = typeof comprovante_url === 'string' && comprovante_url.startsWith('http') ? comprovante_url : null

  const admin = createAdminClient()
  const { data: entregador } = await admin
    .from('entregadores').select('id, stripe_account_id, stripe_onboarded').eq('user_id', user.id).single()
  if (!entregador) return NextResponse.json({ error: 'Perfil de entregador não encontrado' }, { status: 403 })

  const { data: pedido } = await admin
    .from('pedidos_clientes')
    .select('*') // '*' evita erro se as colunas de pagamento ainda não existirem (pré-migração)
    .eq('id', pedido_id).single()
  if (!pedido) return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 })
  if (pedido.entregador_id !== entregador.id) return NextResponse.json({ error: 'Este pedido não é seu.' }, { status: 403 })
  if (pedido.status === 'entregue') return NextResponse.json({ ok: true, already: true })

  // O código vive em `pedido_codigos`, que o entregador NÃO consegue ler (só o
  // cliente e a loja) — se ele vê o código, marca "entregue" sem encontrar o
  // cliente, que é exatamente o que o código existe para impedir.
  // `codigo_confirmacao` é coluna legada e hoje é sempre null; fica como
  // fallback só para não quebrar algum pedido anterior à migração.
  const { data: linhaCodigo } = await admin
    .from('pedido_codigos').select('codigo').eq('pedido_id', pedido_id).maybeSingle()
  const esperado = linhaCodigo?.codigo || pedido.codigo_confirmacao
  if (!esperado) return NextResponse.json({ error: 'Este pedido ainda não saiu para entrega.' }, { status: 409 })
  if (String(codigo).trim() !== esperado) {
    return NextResponse.json({ error: 'Código incorreto. Confira com o cliente.' }, { status: 400 })
  }

  const updatePayload: Record<string, unknown> = { status: 'entregue' }
  if (comprovante) updatePayload.comprovante_entrega_url = comprovante
  const { error: updErr } = await admin.from('pedidos_clientes').update(updatePayload).eq('id', pedido_id)
  // Se a coluna comprovante ainda não existe (pré-migração), refaz sem ela.
  if (updErr && comprovante) {
    const { error: e2 } = await admin.from('pedidos_clientes').update({ status: 'entregue' }).eq('id', pedido_id)
    if (e2) return NextResponse.json({ error: 'Erro ao confirmar a entrega.' }, { status: 500 })
  } else if (updErr) {
    return NextResponse.json({ error: 'Erro ao confirmar a entrega.' }, { status: 500 })
  }

  // Push do "Pedido entregue" para o cliente (o trigger já gravou a notificação).
  await dispatchPushPedido(admin, pedido_id)

  // Payout da corrida + gorjeta via Stripe Connect (lib/repasse.ts). Best-effort:
  // a entrega já foi confirmada. Se o transfer falhar, fica
  // pagamento_corrida='pendente' COM o erro gravado; o cron diário
  // /api/repasse/cron tenta de novo e o admin vê em "Repasses travados".
  //
  // Só transfere quando o pedido foi PAGO ONLINE: aí a plataforma reteve taxa +
  // gorjeta (destination charge com transfer_data.amount=subtotal). Em pedidos
  // "na entrega" o entregador recebe a corrida direto do cliente.
  const pagoOnline = pedido.pagamento_metodo === 'online' && pedido.pagamento_status === 'pago'
  const repasse = pagoOnline ? await pagarCorrida(admin, pedido_id) : null
  const pago = !!repasse?.pago
  const valor = repasse ? repasse.valor : Number(pedido.valor_corrida) || 0
  const gorjeta = pagoOnline ? Number(pedido.gorjeta) || 0 : 0

  // Indicação paga: se ESTE entregador foi indicado por outro, a 5ª entrega
  // libera os R$30 do indicador (idempotente; o cron cobre falhas).
  try { await verificarBonusIndicacao(admin, entregador.id) } catch (e) {
    console.error('[entregador/confirmar-entrega] bônus de indicação falhou:', e)
  }

  const dinheiro = pedido.pagamento_metodo !== 'online'
  const repasseLoja = dinheiro ? Math.max(0, Math.round((Number(pedido.total) - Number(pedido.taxa_entrega)) * 100) / 100) : 0
  return NextResponse.json({ ok: true, pago, valor, gorjeta, dinheiro, repasse_loja: repasseLoja, repasse_erro: repasse?.erro ?? null })
}
