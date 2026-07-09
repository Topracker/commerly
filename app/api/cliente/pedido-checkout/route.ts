import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import Stripe from 'stripe'
import { createAdminClient } from '../../../lib/supabase-admin'
import { rateLimit } from '../../../lib/rate-limit'
import { distanciaKm, taxaEntregaPorDistancia } from '../../../lib/geo'
import { isDelivery } from '../../../lib/pedidosClientes'
import { descontoDePontos, maxPontosResgataveis } from '../../../lib/fidelidade'

// Inicia o pagamento ONLINE de um pedido de delivery via Stripe Checkout.
//
// - Recalcula preços (dos produtos no banco), distância e taxa NO SERVIDOR —
//   nunca confia nos valores do cliente.
// - Grava um pedido PENDENTE (pedidos_pendentes); o pedido real só nasce quando
//   o webhook recebe o pagamento confirmado.
// - Destination charge: o subtotal (produtos) é transferido para a conta Connect
//   da loja; a taxa de entrega fica na plataforma para pagar o entregador depois.
export async function POST(request: NextRequest) {
  const cookieStore = await cookies()
  const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } },
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (!rateLimit(`pedido-checkout:${user.id}`, 10, 60_000)) {
    return NextResponse.json({ error: 'Muitas tentativas. Aguarde um instante.' }, { status: 429 })
  }
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: 'Pagamento online indisponível no momento.' }, { status: 503 })
  }

  const body = await request.json().catch(() => ({}))
  const { loja_id, itens, endereco_entrega, entrega_latitude, entrega_longitude, observacao, pontos_resgatar } = body || {}
  if (!loja_id || !Array.isArray(itens) || itens.length === 0 || !endereco_entrega?.trim()) {
    return NextResponse.json({ error: 'Dados do pedido incompletos.' }, { status: 400 })
  }
  if (entrega_latitude == null || entrega_longitude == null) {
    return NextResponse.json({ error: 'Confirme o ponto de entrega no mapa.' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Cliente (dono da sessão).
  const { data: cliente } = await admin
    .from('clientes').select('id, nome, telefone').eq('user_id', user.id).single()
  if (!cliente) return NextResponse.json({ error: 'Perfil de cliente não encontrado.' }, { status: 403 })

  // Loja: precisa ser delivery e estar apta a receber online (Connect concluído).
  const { data: loja } = await admin
    .from('lojas').select('id, nome, tipo, latitude, longitude, stripe_account_id, stripe_onboarded, distancia_maxima_entrega').eq('id', loja_id).single()
  if (!loja) return NextResponse.json({ error: 'Loja não encontrada.' }, { status: 404 })
  if (!isDelivery(loja.tipo)) return NextResponse.json({ error: 'Esta loja não aceita pedidos de delivery.' }, { status: 400 })
  if (!loja.stripe_account_id || !loja.stripe_onboarded) {
    return NextResponse.json({ error: 'Esta loja ainda não aceita pagamento online. Escolha pagar na entrega.' }, { status: 409 })
  }

  // Preços AUTORITATIVOS: relê os produtos no banco (ignora o preço do cliente).
  const ids = [...new Set(itens.map((i: any) => i.produto_id).filter(Boolean))]
  const { data: produtos } = await admin
    .from('produtos').select('id, nome, preco_venda, quantidade').eq('loja_id', loja.id).in('id', ids)
  const mapa = new Map((produtos || []).map((p: any) => [p.id, p]))

  const itensLimpos: { produto_id: string; nome: string; preco: number; quantidade: number }[] = []
  let subtotal = 0
  for (const it of itens) {
    const p: any = mapa.get(it.produto_id)
    const qtd = Math.floor(Number(it.quantidade) || 0)
    if (!p || qtd <= 0) continue
    if (p.quantidade != null && qtd > p.quantidade) {
      return NextResponse.json({ error: `Sem estoque suficiente de ${p.nome}.` }, { status: 409 })
    }
    const preco = Number(p.preco_venda) || 0
    itensLimpos.push({ produto_id: p.id, nome: p.nome, preco, quantidade: qtd })
    subtotal += preco * qtd
  }
  if (itensLimpos.length === 0) return NextResponse.json({ error: 'Nenhum produto válido no pedido.' }, { status: 400 })

  // Distância loja->entrega e taxa (mesma fórmula do trigger calcular_taxa_entrega).
  const dist = distanciaKm(
    { latitude: loja.latitude, longitude: loja.longitude },
    { latitude: Number(entrega_latitude), longitude: Number(entrega_longitude) },
  )
  // Fora da área de entrega -> recusa ANTES de cobrar (o trigger também barra,
  // mas aqui evita cobrar o cliente e o pedido ser rejeitado no webhook depois).
  const distMax = loja.distancia_maxima_entrega != null ? Number(loja.distancia_maxima_entrega) : null
  if (dist != null && distMax != null && dist > distMax) {
    return NextResponse.json({ error: `Endereço fora da área de entrega. Esta loja entrega até ${distMax} km.` }, { status: 409 })
  }

  const taxa = taxaEntregaPorDistancia(dist)

  // Resgate de pontos (Clube Commerly). O saldo é GLOBAL — vale em qualquer
  // loja — então validamos contra clube_saldo, limitando ao subtotal e nunca
  // confiando no valor mandado pelo cliente. O guard do banco revalida na
  // criação do pedido (webhook) e o trigger debita entre as lojas.
  let pontosUsados = 0
  let desconto = 0
  const pontosPedidos = Math.max(0, Math.floor(Number(pontos_resgatar) || 0))
  if (pontosPedidos > 0) {
    const { data: saldoRow } = await admin
      .from('clube_saldo').select('saldo').eq('cliente_id', cliente.id).maybeSingle()
    const saldo = Number(saldoRow?.saldo) || 0
    const maxUsavel = maxPontosResgataveis(saldo, subtotal)
    pontosUsados = Math.min(pontosPedidos - (pontosPedidos % 100), maxUsavel)
    desconto = descontoDePontos(pontosUsados)
  }

  const subtotalComDesconto = Math.max(subtotal - desconto, 0)
  const total = subtotalComDesconto + taxa
  const subtotalCents = Math.round(subtotalComDesconto * 100)
  const taxaCents = Math.round(taxa * 100)
  if (subtotalCents <= 0) return NextResponse.json({ error: 'Valor do pedido inválido.' }, { status: 400 })

  // Pedido PENDENTE (vira pedido real no webhook, após o pagamento).
  const { data: pend, error: pendErr } = await admin.from('pedidos_pendentes').insert({
    cliente_id: cliente.id,
    loja_id: loja.id,
    itens: itensLimpos,
    endereco_entrega: endereco_entrega.trim(),
    entrega_latitude: Number(entrega_latitude),
    entrega_longitude: Number(entrega_longitude),
    observacao: observacao?.trim() || null,
    cliente_nome: cliente.nome || null,
    cliente_telefone: cliente.telefone || null,
    subtotal, taxa_entrega: taxa, total,
    pontos_usados: pontosUsados, desconto_pontos: desconto,
  }).select('id').single()
  if (pendErr || !pend) {
    console.error('[pedido-checkout] erro ao gravar pendente:', pendErr?.message)
    return NextResponse.json({ error: 'Não foi possível iniciar o pagamento.' }, { status: 500 })
  }

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
    const meta = { tipo: 'pedido_online', pendente_id: pend.id, loja_id: loja.id, cliente_id: cliente.id }
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      // Cartão + Pix. Pix é assíncrono: o pedido só nasce no webhook, ao receber
      // `checkout.session.async_payment_succeeded` (ver app/api/stripe/webhook).
      payment_method_types: ['card', 'pix'],
      payment_method_options: {
        // Prazo do QR do Pix (30 min): evita pedido pendente parado por muito tempo.
        pix: { expires_after_seconds: 1800 },
        // Parcelamento no cartão (Brasil): o Checkout mostra as opções de
        // parcelas (até 12x, conforme elegibilidade do cartão) antes de
        // confirmar. O comerciante recebe o valor total — a Stripe/emissor
        // cuidam do parcelamento para o cliente.
        card: { installments: { enabled: true } },
      },
      // Antifraude (Stripe Radar): coletar o endereço de cobrança dá o CEP à
      // verificação de risco. O CVC já é sempre exigido pelo Checkout no cartão.
      // Regras de bloqueio (cartão de alto risco / 3DS) ficam no painel do Radar.
      billing_address_collection: 'required',
      customer_email: user.email || undefined,
      line_items: [
        { quantity: 1, price_data: { currency: 'brl', unit_amount: subtotalCents, product_data: { name: desconto > 0 ? `Pedido — ${loja.nome} (−R$ ${desconto} em pontos)` : `Pedido — ${loja.nome}` } } },
        ...(taxaCents > 0
          ? [{ quantity: 1, price_data: { currency: 'brl' as const, unit_amount: taxaCents, product_data: { name: 'Taxa de entrega' } } }]
          : []),
      ],
      payment_intent_data: {
        // Destination charge: subtotal vai pra loja; a taxa fica na plataforma
        // (para pagar o entregador no confirmar-entrega).
        transfer_data: { destination: loja.stripe_account_id, amount: subtotalCents },
        metadata: meta,
      },
      metadata: meta,
      success_url: `${origin}/cliente/pedidos?pagamento=sucesso`,
      cancel_url: `${origin}/cliente/loja/${loja.id}?pagamento=cancelado`,
    })

    await admin.from('pedidos_pendentes').update({ stripe_session_id: session.id }).eq('id', pend.id)
    if (!session.url) throw new Error('sessão sem URL')
    return NextResponse.json({ url: session.url })
  } catch (e) {
    console.error('[pedido-checkout] erro ao criar checkout:', e)
    await admin.from('pedidos_pendentes').delete().eq('id', pend.id)
    return NextResponse.json({ error: 'Não foi possível iniciar o pagamento online.' }, { status: 500 })
  }
}
