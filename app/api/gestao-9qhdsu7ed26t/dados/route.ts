import { NextRequest, NextResponse } from 'next/server'
import { exigirAdminAuditado } from '../../../lib/admin'
import { getFlags } from '../../../lib/featureFlags'
import { situacaoPlano } from '../../../lib/plano'
import { precoBase, precoComDesconto, pctIndicacoes } from '../../../lib/precos'
import { COMISSAO_PCT } from '../../../lib/b2b'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ============================================================================
// PAINEL MASTER — overview + listas + analytics, tudo numa carga.
// ----------------------------------------------------------------------------
// O que vem daqui é SÓ do banco. MRR real (o que a Stripe efetivamente cobrou)
// mora em `../faturamento`, numa rota separada de propósito: a Stripe é uma
// chamada de rede externa e não pode segurar o painel inteiro quando estiver
// lenta ou fora do ar.
//
// Dois defeitos corrigidos na auditoria de 2026-09-18:
//
// 1. "Receita movimentada" somava `pedidos_clientes.total + vendas.valor_total`
//    e chamava isso de receita. Aquilo é GMV — dinheiro que passou pelo caixa
//    das LOJAS e nunca pela conta da Commerly. Com faturamento na tela ao lado,
//    o rótulo viraria armadilha. Agora vão os dois números, separados e com
//    nome: `gmv` (ecossistema) e `comissoes` (o que é nosso).
//
// 2. "Receita por cidade" agrupava por `lojas.localizacao`, que é endereço
//    livre ("Rua BF13A, Floresta, Goiânia, GO" x "Goiânia "). Cada loja caía
//    num balde próprio — o gráfico era "receita por loja" com nome de rua no
//    eixo. Agora agrupa por `cidade_slug`, que é normalizado. E o mapa
//    loja -> cidade era montado de uma lista com .limit(30): acima de 30 lojas
//    o resto dos pedidos caía em '—'. Agora o mapa lê TODAS as lojas.
// ============================================================================

const DIA_MS = 86_400_000

export async function GET(request: NextRequest) {
  const ctx = await exigirAdminAuditado(request, 'dados')
  if (!ctx.ok) return new NextResponse(null, { status: 404 })
  const { admin } = ctx

  const h = (t: string, f?: (q: any) => any) => {
    let q = admin.from(t).select('id', { count: 'exact', head: true })
    if (f) q = f(q)
    return q
  }

  const [
    { count: comerciantes }, { count: clientes }, { count: entregadores }, { count: fornecedores },
    { count: pedidos }, { count: fundadores }, { count: parceiros },
    { data: cidades }, { data: pedidosVals }, { data: vendasVals },
    { data: lojasRec }, { data: clientesRec }, { data: entregadoresRec },
    { data: pendentes }, { data: parceirosRec }, { data: fundadoresRec },
    { data: codigos }, { data: novasLojas }, { data: novosClientes }, { data: novosEntreg },
    { data: pedidosCidade }, flagsGlobais,
    { data: lojasTodas }, { data: pedidosSerie }, { data: indicacoes },
    { data: b2bPagos }, { data: entregasPagas }, { data: produtosLojas },
    { data: feedbacks },
  ] = await Promise.all([
    h('lojas'), h('clientes'), h('entregadores'), h('fornecedores'),
    h('pedidos_clientes', q => q.neq('status', 'cancelado')),
    h('fundadores'), h('parceiros'),
    admin.from('cidades_expansao').select('nome, uf, slug, pontos, meta_pontos, status').order('pontos', { ascending: false }),
    admin.from('pedidos_clientes').select('total').neq('status', 'cancelado'),
    admin.from('vendas').select('valor_total'),
    admin.from('lojas').select('id, nome, tipo, localizacao, plano, fundador, created_at').order('created_at', { ascending: false }).limit(30),
    admin.from('clientes').select('id, nome, created_at').order('created_at', { ascending: false }).limit(30),
    admin.from('entregadores').select('id, nome, telefone, aprovacao_status, kit_comprado, created_at').order('created_at', { ascending: false }).limit(30),
    // A foto da bolsa entra aqui porque a aprovação passou a olhar equipamento,
    // não só documento — o admin decide vendo se a bolsa serve.
    admin.from('entregadores').select('id, nome, telefone, veiculo_tipo, documento_numero, documento_foto_url, foto_url, tem_bolsa, bolsa_foto_url, bolsa_confirmada_em, created_at').eq('aprovacao_status', 'pendente').order('created_at', { ascending: true }).limit(50),
    admin.from('parceiros').select('id, nome, email, codigo, nivel, created_at').order('created_at', { ascending: false }).limit(30),
    admin.from('fundadores').select('loja_id, ordem, cidade, created_at').order('ordem', { ascending: true }).limit(60),
    admin.from('codigos_indicacao').select('codigo, usos, papel').gt('usos', 0).order('usos', { ascending: false }).limit(30),
    admin.from('lojas').select('created_at'),
    admin.from('clientes').select('created_at'),
    admin.from('entregadores').select('created_at'),
    admin.from('pedidos_clientes').select('total, loja_id, status').neq('status', 'cancelado').limit(5000),
    getFlags(null, admin),

    // ── Novas consultas (auditoria 2026-09-18) ──────────────────────────────
    // TODAS as lojas: é o mapa loja -> cidade/plano. Sem .limit() de propósito
    // (era o bug nº 2 lá de cima).
    admin.from('lojas').select('id, user_id, nome, plano, fundador, trial_expira_em, cidade_slug, created_at'),
    admin.from('pedidos_clientes').select('total, created_at, status').neq('status', 'cancelado').limit(10000),
    admin.from('indicacoes').select('indicador_user_id, assinou_em'),
    admin.from('pedidos').select('comissao, total').eq('pagamento_status', 'pago'),
    admin.from('pedidos_clientes').select('taxa_entrega, valor_corrida').eq('status', 'entregue'),
    admin.from('produtos').select('loja_id'),
    admin.from('feedbacks').select('id, loja_id, tipo, mensagem, created_at').order('created_at', { ascending: false }).limit(200),
  ])

  const lojas = lojasTodas || []

  // ── GMV x receita da Commerly ──────────────────────────────────────────────
  // GMV: o que circulou nas lojas (pedidos de delivery + vendas de balcão).
  const gmv =
    (pedidosVals || []).reduce((s: number, p: any) => s + (Number(p.total) || 0), 0) +
    (vendasVals || []).reduce((s: number, v: any) => s + (Number(v.valor_total) || 0), 0)

  // Comissão B2B: valor JÁ retido pela Stripe (application_fee), não estimativa.
  const comissaoB2B = (b2bPagos || []).reduce((s: number, p: any) => s + (Number(p.comissao) || 0), 0)

  // Margem de delivery: a plataforma retém a taxa de entrega (destination
  // charge com transfer_data.amount = subtotal) e paga `valor_corrida` ao
  // entregador no confirmar-entrega. O que sobra é nosso.
  const taxas = (entregasPagas || []).reduce((s: number, p: any) => s + (Number(p.taxa_entrega) || 0), 0)
  const corridas = (entregasPagas || []).reduce((s: number, p: any) => s + (Number(p.valor_corrida) || 0), 0)
  const margemDelivery = Math.round((taxas - corridas) * 100) / 100

  // ── Planos: ativo / teste / vencido ────────────────────────────────────────
  // Usa a MESMA função do paywall (situacaoPlano) para o painel não inventar
  // uma terceira definição de "em dia" — já houve dissonância entre TS e SQL.
  const planos = { ativas: 0, teste: 0, vencidas: 0, testeVencendo7: 0 }
  for (const l of lojas) {
    const s = situacaoPlano(l as any)
    if (s.assinante) planos.ativas++
    else if (s.emTeste) {
      planos.teste++
      if (s.diasDeTeste <= 7) planos.testeVencendo7++
    } else planos.vencidas++
  }

  // ── MRR ESTIMADO (do banco) ────────────────────────────────────────────────
  // ESTIMADO, e o painel diz isso na tela. A autoridade é a Stripe: aqui só
  // aplicamos a tabela de preços sobre quem está com plano='ativo'.
  //
  // Divergência que importa: loja com plano='ativo' e SEM stripe_subscription_id
  // nunca passou pelo webhook (que grava plano e id JUNTOS) — ou seja, foi
  // ativada na mão. Contar isso como receita é inventar dinheiro, então o
  // número sai acompanhado da contagem de divergentes.
  const indicacoesPorUser: Record<string, number> = {}
  for (const i of indicacoes || []) {
    if (!i.assinou_em || !i.indicador_user_id) continue
    indicacoesPorUser[i.indicador_user_id] = (indicacoesPorUser[i.indicador_user_id] || 0) + 1
  }

  let mrrEstimado = 0
  let semAssinatura = 0
  const ativas = lojas.filter(l => situacaoPlano(l as any).assinante)
  for (const l of ativas) {
    const base = precoBase(l.fundador)
    const pct = pctIndicacoes(indicacoesPorUser[l.user_id] || 0)
    mrrEstimado += precoComDesconto(base, pct)
  }
  mrrEstimado = Math.round(mrrEstimado * 100) / 100

  // `stripe_subscription_id` não vem na seleção acima (é dado sensível e não
  // precisa trafegar); conta-se por consulta dedicada.
  {
    const { count } = await admin.from('lojas')
      .select('id', { count: 'exact', head: true })
      .eq('plano', 'ativo').is('stripe_subscription_id', null)
    semAssinatura = count || 0
  }

  // ── Crescimento diário (14 dias) por papel ────────────────────────────────
  const dias: string[] = []
  for (let i = 13; i >= 0; i--) dias.push(new Date(Date.now() - i * DIA_MS).toISOString().slice(0, 10))
  const bucket = (rows: any[]) => {
    const m: Record<string, number> = {}
    for (const r of rows || []) { const d = String(r.created_at).slice(0, 10); m[d] = (m[d] || 0) + 1 }
    return dias.map(d => m[d] || 0)
  }
  const crescimento = {
    dias, lojas: bucket(novasLojas || []), clientes: bucket(novosClientes || []), entregadores: bucket(novosEntreg || []),
  }

  // ── Pedidos e GMV por dia (30 dias) ───────────────────────────────────────
  const dias30: string[] = []
  for (let i = 29; i >= 0; i--) dias30.push(new Date(Date.now() - i * DIA_MS).toISOString().slice(0, 10))
  const porDia: Record<string, { pedidos: number; gmv: number }> = {}
  for (const p of pedidosSerie || []) {
    const d = String(p.created_at).slice(0, 10)
    if (!porDia[d]) porDia[d] = { pedidos: 0, gmv: 0 }
    porDia[d].pedidos++
    porDia[d].gmv += Number(p.total) || 0
  }
  const serie = dias30.map(d => ({
    dia: d,
    pedidos: porDia[d]?.pedidos || 0,
    gmv: Math.round((porDia[d]?.gmv || 0) * 100) / 100,
  }))

  // ── Receita/pedidos por CIDADE (cidade_slug, não endereço livre) ──────────
  const cidadeDaLoja: Record<string, string> = {}
  for (const l of lojas) cidadeDaLoja[l.id] = l.cidade_slug || 'sem-cidade'
  const nomeDaCidade: Record<string, string> = {}
  for (const c of cidades || []) nomeDaCidade[c.slug] = `${c.nome}/${c.uf}`

  const porCidade: Record<string, { pedidos: number; gmv: number }> = {}
  for (const p of pedidosCidade || []) {
    const slug = cidadeDaLoja[p.loja_id] || 'sem-cidade'
    if (!porCidade[slug]) porCidade[slug] = { pedidos: 0, gmv: 0 }
    porCidade[slug].pedidos++
    porCidade[slug].gmv += Number(p.total) || 0
  }
  // Lojas por cidade entram mesmo sem pedido: cidade com loja e zero venda é
  // informação, não ausência de linha.
  const lojasPorCidade: Record<string, number> = {}
  for (const l of lojas) {
    const slug = l.cidade_slug || 'sem-cidade'
    lojasPorCidade[slug] = (lojasPorCidade[slug] || 0) + 1
  }
  const cidadesResumo = Object.keys({ ...porCidade, ...lojasPorCidade })
    .map(slug => ({
      slug,
      cidade: nomeDaCidade[slug] || (slug === 'sem-cidade' ? 'Sem cidade' : slug),
      lojas: lojasPorCidade[slug] || 0,
      pedidos: porCidade[slug]?.pedidos || 0,
      gmv: Math.round((porCidade[slug]?.gmv || 0) * 100) / 100,
    }))
    .sort((a, b) => b.gmv - a.gmv || b.lojas - a.lojas)
    .slice(0, 20)

  // ── Funil de ativação ─────────────────────────────────────────────────────
  const lojasComProduto = new Set((produtosLojas || []).map((p: any) => p.loja_id))
  const lojasComPedido = new Set((pedidosCidade || []).map((p: any) => p.loja_id))
  const funil = {
    cadastradas: lojas.length,
    comProduto: lojas.filter(l => lojasComProduto.has(l.id)).length,
    comPedido: lojas.filter(l => lojasComPedido.has(l.id)).length,
    assinantes: planos.ativas,
  }

  // ── Feedbacks ─────────────────────────────────────────────────────────────
  // A RLS de `feedbacks` só deixa o DONO ler o que escreveu — nem o admin lê
  // pelo navegador. Por isso a lista só existe aqui, com service role.
  const nomeDaLoja: Record<string, string> = {}
  for (const l of lojas) nomeDaLoja[l.id] = l.nome
  // `feedbacks.created_at` é `timestamp WITHOUT time zone`: o PostgREST devolve
  // "2026-09-18T14:56:00" sem offset e o navegador leria como hora LOCAL — 3h
  // de erro em Brasília. O banco grava em UTC, então o sufixo 'Z' é a verdade.
  const emUtc = (t: unknown) =>
    typeof t === 'string' && !/(Z|[+-]\d\d:?\d\d)$/.test(t) ? t + 'Z' : t
  const feedbacksLista = (feedbacks || []).map((f: any) => ({
    id: f.id,
    tipo: f.tipo,
    mensagem: f.mensagem,
    created_at: emUtc(f.created_at),
    loja: nomeDaLoja[f.loja_id] || '—',
  }))

  return NextResponse.json({
    contadores: {
      comerciantes, clientes, entregadores, fornecedores, pedidos, fundadores, parceiros,
      gmv: Math.round(gmv * 100) / 100,
      cidades: (cidades || []).length,
      embaixadores: (codigos || []).length,
    },
    planos,
    faturamentoBanco: {
      estimado: true,
      mrrEstimado,
      assinantes: planos.ativas,
      semAssinatura,
      comissaoB2B: Math.round(comissaoB2B * 100) / 100,
      comissaoPct: COMISSAO_PCT,
      margemDelivery,
      taxasEntrega: Math.round(taxas * 100) / 100,
      pagoEntregadores: Math.round(corridas * 100) / 100,
      receitaCommerly: Math.round((comissaoB2B + margemDelivery) * 100) / 100,
    },
    crescimento,
    serie,
    funil,
    listas: {
      lojas: lojasRec, clientes: clientesRec, entregadores: entregadoresRec,
      parceiros: parceirosRec, fundadores: fundadoresRec, embaixadores: codigos,
      pendentes,
      feedbacks: feedbacksLista,
    },
    cidades, cidadesResumo, flagsGlobais,
  })
}
