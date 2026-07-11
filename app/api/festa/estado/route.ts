import { NextRequest, NextResponse } from 'next/server'
import { autenticarCliente } from '../_lib'

// Estado completo da sala da festa, para o participante: dados da festa, lojas
// (com produtos disponíveis), participantes (com carrinho e "pronto") e os
// pedidos gerados (quando já fechada). Só participantes enxergam.
export async function GET(request: NextRequest) {
  const auth = await autenticarCliente()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { admin, cliente } = auth.ctx

  const festaId = new URL(request.url).searchParams.get('festa_id')
  if (!festaId) return NextResponse.json({ error: 'festa_id obrigatório' }, { status: 400 })

  const { data: festa } = await admin.from('festas').select('*').eq('id', festaId).maybeSingle()
  if (!festa) return NextResponse.json({ error: 'Festa não encontrada.' }, { status: 404 })

  // Autorização: precisa ser participante (o criador também é participante).
  const { data: souPart } = await admin
    .from('festa_participantes').select('id').eq('festa_id', festaId).eq('cliente_id', cliente.id).maybeSingle()
  if (!souPart) return NextResponse.json({ error: 'Você não participa desta festa.' }, { status: 403 })

  // Lojas + produtos disponíveis (com promoção aplicada, como na página da loja).
  const { data: fl } = await admin.from('festa_lojas').select('loja_id').eq('festa_id', festaId)
  const lojaIds = (fl || []).map(r => r.loja_id as string)

  const [lojasRes, produtosRes, promoRes, partsRes] = await Promise.all([
    admin.from('lojas').select('id, nome, tipo, latitude, longitude').in('id', lojaIds),
    admin.from('produtos').select('id, loja_id, nome, preco_venda, imagem_url, categoria').in('loja_id', lojaIds).gt('quantidade', 0),
    admin.from('promocoes').select('produto_id, loja_id, preco_promocional, desconto_pct').in('loja_id', lojaIds).eq('ativa', true),
    admin.from('festa_participantes').select('id, cliente_id, itens, pronto, pedido_id, entrou_em').eq('festa_id', festaId).order('entrou_em', { ascending: true }),
  ])

  const promos = new Map(
    (promoRes.data || []).map((p: any) => [p.produto_id as string, { preco: Number(p.preco_promocional) || 0, desconto_pct: p.desconto_pct }]),
  )
  const produtos = (produtosRes.data || []).map((p: any) => {
    const promo = promos.get(p.id)
    return promo && promo.preco > 0
      ? { ...p, preco_venda: promo.preco, preco_original: Number(p.preco_venda), desconto_pct: promo.desconto_pct }
      : p
  })

  // Nomes dos participantes (para exibir "quem está na festa").
  const partClienteIds = [...new Set((partsRes.data || []).map((p: any) => p.cliente_id))]
  const { data: nomesRows } = await admin.from('clientes').select('id, nome').in('id', partClienteIds)
  const nomes = new Map((nomesRows || []).map((c: any) => [c.id, c.nome]))

  // Pedidos já gerados (quando fechada) — para status em tempo real e ETA.
  const pedidoIds = (partsRes.data || []).map((p: any) => p.pedido_id).filter(Boolean) as string[]
  const pedidosMap = new Map<string, any>()
  if (pedidoIds.length > 0) {
    const { data: peds } = await admin
      .from('pedidos_clientes')
      .select('id, status, total, taxa_entrega, entregador_id, tempo_preparo_min, distancia_km, eta_em, created_at')
      .in('id', pedidoIds)
    for (const pd of peds || []) pedidosMap.set(pd.id, pd)
  }

  const participantes = (partsRes.data || []).map((p: any) => {
    const pedido = p.pedido_id ? pedidosMap.get(p.pedido_id) : null
    return {
      id: p.id,
      cliente_id: p.cliente_id,
      nome: nomes.get(p.cliente_id) || 'Convidado',
      itens: Array.isArray(p.itens) ? p.itens : [],
      pronto: p.pronto,
      tem_pedido: !!p.pedido_id,
      sou_eu: p.cliente_id === cliente.id,
      pedido: pedido ? {
        id: pedido.id,
        status: pedido.status,
        total: Number(pedido.total) || 0,
        taxa_entrega: Number(pedido.taxa_entrega) || 0,
        tem_entregador: !!pedido.entregador_id,
        tempo_preparo_min: pedido.tempo_preparo_min,
        distancia_km: pedido.distancia_km,
        eta_em: pedido.eta_em,
        created_at: pedido.created_at,
      } : null,
    }
  })

  return NextResponse.json({
    festa,
    sou_criador: festa.criador_cliente_id === cliente.id,
    lojas: lojasRes.data || [],
    produtos,
    participantes,
  })
}
