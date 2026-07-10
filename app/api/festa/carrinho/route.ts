import { NextRequest, NextResponse } from 'next/server'
import { autenticarCliente, bodyDe } from '../_lib'
import { rateLimit } from '../../../lib/rate-limit'

// Salva o carrinho do participante na festa. Um participante pede de UMA loja da
// festa (o pedido gerado no fechamento tem uma loja só) — a festa passa por até
// 3 lojas porque pessoas diferentes escolhem lojas diferentes.
//
// Os preços são RELIDOS do banco (com promoção): o carrinho vira pedido no
// fechamento, então não confiamos no preço enviado pelo cliente.
export async function POST(request: NextRequest) {
  const auth = await autenticarCliente()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { admin, cliente } = auth.ctx

  if (!rateLimit(`festa-carrinho:${cliente.id}`, 60, 60_000)) {
    return NextResponse.json({ error: 'Muitas tentativas. Aguarde.' }, { status: 429 })
  }

  const body = await bodyDe(request)
  const festaId = String(body?.festa_id || '')
  const pronto = body?.pronto === true
  const itensReq: any[] = Array.isArray(body?.itens) ? body.itens : []
  if (!festaId) return NextResponse.json({ error: 'festa_id obrigatório' }, { status: 400 })

  const { data: festa } = await admin.from('festas').select('id, status').eq('id', festaId).maybeSingle()
  if (!festa) return NextResponse.json({ error: 'Festa não encontrada.' }, { status: 404 })
  if (festa.status !== 'aberta') return NextResponse.json({ error: 'Esta festa já foi fechada.' }, { status: 409 })

  const { data: part } = await admin
    .from('festa_participantes').select('id').eq('festa_id', festaId).eq('cliente_id', cliente.id).maybeSingle()
  if (!part) return NextResponse.json({ error: 'Você não participa desta festa.' }, { status: 403 })

  const { data: fl } = await admin.from('festa_lojas').select('loja_id').eq('festa_id', festaId)
  const lojasFesta = new Set((fl || []).map(r => r.loja_id as string))

  // Carrinho vazio -> zera itens e "pronto".
  if (itensReq.length === 0) {
    await admin.from('festa_participantes').update({ itens: [], pronto: false }).eq('id', part.id)
    return NextResponse.json({ ok: true, itens: [], subtotal: 0 })
  }

  const ids = [...new Set(itensReq.map(i => i?.produto_id).filter(Boolean))]
  const [{ data: produtos }, { data: promos }] = await Promise.all([
    admin.from('produtos').select('id, loja_id, nome, preco_venda, quantidade').in('id', ids),
    admin.from('promocoes').select('produto_id, preco_promocional').in('produto_id', ids).eq('ativa', true),
  ])
  const mapa = new Map((produtos || []).map((p: any) => [p.id, p]))
  const promoMap = new Map((promos || []).map((p: any) => [p.produto_id as string, Number(p.preco_promocional) || 0]))

  const limpos: { produto_id: string; loja_id: string; nome: string; preco: number; quantidade: number }[] = []
  let lojaUnica: string | null = null
  let subtotal = 0
  for (const it of itensReq) {
    const p: any = mapa.get(it?.produto_id)
    const qtd = Math.floor(Number(it?.quantidade) || 0)
    if (!p || qtd <= 0) continue
    if (!lojasFesta.has(p.loja_id)) {
      return NextResponse.json({ error: 'Um dos produtos não é de uma loja da festa.' }, { status: 400 })
    }
    if (lojaUnica && lojaUnica !== p.loja_id) {
      return NextResponse.json({ error: 'Escolha produtos de uma loja só. A festa junta os pedidos de todos.' }, { status: 400 })
    }
    lojaUnica = p.loja_id
    const promo = promoMap.get(p.id)
    const preco = promo && promo > 0 ? promo : Number(p.preco_venda) || 0
    limpos.push({ produto_id: p.id, loja_id: p.loja_id, nome: p.nome, preco, quantidade: qtd })
    subtotal += preco * qtd
  }
  if (limpos.length === 0) return NextResponse.json({ error: 'Nenhum produto válido.' }, { status: 400 })

  const { error } = await admin
    .from('festa_participantes').update({ itens: limpos, pronto }).eq('id', part.id)
  if (error) return NextResponse.json({ error: 'Não foi possível salvar o carrinho.' }, { status: 500 })

  return NextResponse.json({ ok: true, itens: limpos, subtotal: Math.round(subtotal * 100) / 100 })
}
