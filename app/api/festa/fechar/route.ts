import { NextRequest, NextResponse } from 'next/server'
import { autenticarCliente, bodyDe } from '../_lib'
import { rateLimit } from '../../../lib/rate-limit'
import { distanciaKm, taxaEntregaPorDistancia } from '../../../lib/geo'
import { taxaPorPessoa, valorCorridaFesta, FESTA_BONUS_PCT } from '../../../lib/festas'
import { ofertarFesta } from '../../../lib/festaDispatch'

// Fecha a festa (só o criador). Aqui mora a matemática do dinheiro:
//
//  - TAXA DA VIAGEM = soma das pernas loja→endereço, uma perna por loja que tem
//    pedido (o entregador passa em cada loja uma vez). Calculada NO SERVIDOR.
//  - RATEIO: a taxa da viagem dividida pelo nº de participantes com itens.
//  - Cada pedido nasce com taxa_entrega = rateio e valor_corrida = rateio +20%
//    (o guard confia nesses valores porque festa_id está setado).
//  - Pagamento SEMPRE na entrega. Depois de criar os pedidos, oferta a corrida
//    ao entregador online mais próximo.
export async function POST(request: NextRequest) {
  const auth = await autenticarCliente()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { admin, cliente } = auth.ctx

  if (!rateLimit(`festa-fechar:${cliente.id}`, 10, 60_000)) {
    return NextResponse.json({ error: 'Muitas tentativas. Aguarde.' }, { status: 429 })
  }

  const festaId = String((await bodyDe(request))?.festa_id || '')
  if (!festaId) return NextResponse.json({ error: 'festa_id obrigatório' }, { status: 400 })

  const { data: festa } = await admin.from('festas').select('*').eq('id', festaId).maybeSingle()
  if (!festa) return NextResponse.json({ error: 'Festa não encontrada.' }, { status: 404 })
  if (festa.criador_cliente_id !== cliente.id) {
    return NextResponse.json({ error: 'Só quem criou a festa pode fechá-la.' }, { status: 403 })
  }
  if (festa.status !== 'aberta') {
    return NextResponse.json({ error: 'Esta festa já foi fechada.' }, { status: 409 })
  }

  // Participantes com itens -> viram pedidos.
  const { data: parts } = await admin
    .from('festa_participantes').select('id, cliente_id, itens, pedido_id')
    .eq('festa_id', festaId)
  const comItens = (parts || []).filter(
    (p: any) => Array.isArray(p.itens) && p.itens.length > 0 && !p.pedido_id,
  )
  if (comItens.length === 0) {
    return NextResponse.json({ error: 'Ninguém adicionou itens ainda. A festa precisa de pelo menos um pedido.' }, { status: 400 })
  }

  // Lojas que efetivamente têm pedido (uma perna cada).
  const lojasComPedido = [...new Set(
    comItens.flatMap((p: any) => (p.itens as any[]).map(i => i.loja_id)).filter(Boolean),
  )] as string[]
  const { data: lojas } = await admin
    .from('lojas').select('id, latitude, longitude').in('id', lojasComPedido)
  const lojaCoord = new Map((lojas || []).map((l: any) => [l.id, l]))

  // Taxa da viagem = soma das pernas loja→endereço.
  let taxaTotal = 0
  for (const lid of lojasComPedido) {
    const l: any = lojaCoord.get(lid)
    const d = l ? distanciaKm(
      { latitude: l.latitude, longitude: l.longitude },
      { latitude: festa.entrega_latitude, longitude: festa.entrega_longitude },
    ) : null
    taxaTotal += taxaEntregaPorDistancia(d)
  }
  taxaTotal = Math.round(taxaTotal * 100) / 100

  const nPart = comItens.length
  const rateio = taxaPorPessoa(taxaTotal, nPart)
  const valorCorrida = valorCorridaFesta(rateio, FESTA_BONUS_PCT)

  // Dados do cliente de cada participante (nome/telefone no pedido).
  const clienteIds = comItens.map((p: any) => p.cliente_id)
  const { data: clientesRows } = await admin
    .from('clientes').select('id, nome, telefone').in('id', clienteIds)
  const clientesMap = new Map((clientesRows || []).map((c: any) => [c.id, c]))

  // Cria um pedido por participante. Cada carrinho já é de uma loja só (o guard
  // de /carrinho garante isso), então loja_id é a loja dos itens.
  const criados: { participante_id: string; pedido_id: string }[] = []
  for (const p of comItens) {
    const itens = p.itens as any[]
    const lojaId = itens[0].loja_id
    const c: any = clientesMap.get(p.cliente_id)
    const { data: pedido, error } = await admin.from('pedidos_clientes').insert({
      loja_id: lojaId,
      cliente_id: p.cliente_id,
      festa_id: festaId,
      itens: itens.map(i => ({ produto_id: i.produto_id, nome: i.nome, preco: i.preco, quantidade: i.quantidade })),
      endereco_entrega: festa.endereco_entrega,
      entrega_latitude: festa.entrega_latitude,
      entrega_longitude: festa.entrega_longitude,
      cliente_nome: c?.nome || null,
      cliente_telefone: c?.telefone || null,
      // O guard confia nestes por causa do festa_id.
      taxa_entrega: rateio,
      valor_corrida: valorCorrida,
      pagamento_metodo: 'entrega',
      pagamento_status: 'pendente',
    }).select('id').single()
    if (error || !pedido) {
      console.error('[festa/fechar] erro ao criar pedido:', error?.message)
      // Best-effort rollback dos pedidos já criados desta festa.
      await admin.from('pedidos_clientes').delete().eq('festa_id', festaId)
      return NextResponse.json({ error: 'Não foi possível gerar os pedidos da festa.' }, { status: 500 })
    }
    criados.push({ participante_id: p.id, pedido_id: pedido.id })
    await admin.from('festa_participantes').update({ pedido_id: pedido.id }).eq('id', p.id)
  }

  // Fecha a festa com o snapshot da taxa.
  await admin.from('festas').update({
    status: 'fechada',
    taxa_total: taxaTotal,
    taxa_por_pessoa: rateio,
    fechada_em: new Date().toISOString(),
  }).eq('id', festaId)

  // Oferta a corrida ao entregador mais próximo (best-effort — se ninguém
  // online, o criador pode tocar "Buscar entregador" de novo).
  let despacho: string = 'sem_entregador'
  try {
    const r = await ofertarFesta(admin, festaId)
    despacho = r.tipo
  } catch (e) {
    console.error('[festa/fechar] despacho falhou:', e)
  }

  return NextResponse.json({
    ok: true,
    pedidos: criados.length,
    taxa_total: taxaTotal,
    taxa_por_pessoa: rateio,
    valor_corrida: valorCorrida,
    despacho,
  })
}
