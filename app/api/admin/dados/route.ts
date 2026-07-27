import { NextResponse } from 'next/server'
import { exigirAdmin } from '../../../lib/admin'
import { getFlags } from '../../../lib/featureFlags'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Painel admin master: overview + listas + analytics, tudo numa carga.
export async function GET() {
  const ctx = await exigirAdmin()
  if (!ctx) return NextResponse.json({ error: 'Acesso restrito' }, { status: 403 })
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
  ])

  const receita =
    (pedidosVals || []).reduce((s: number, p: any) => s + (Number(p.total) || 0), 0) +
    (vendasVals || []).reduce((s: number, v: any) => s + (Number(v.valor_total) || 0), 0)

  // Crescimento diário (últimos 14 dias) por papel.
  const dias: string[] = []
  for (let i = 13; i >= 0; i--) dias.push(new Date(Date.now() - i * 86400000).toISOString().slice(0, 10))
  const bucket = (rows: any[]) => {
    const m: Record<string, number> = {}
    for (const r of rows || []) { const d = String(r.created_at).slice(0, 10); m[d] = (m[d] || 0) + 1 }
    return dias.map(d => m[d] || 0)
  }
  const crescimento = {
    dias, lojas: bucket(novasLojas || []), clientes: bucket(novosClientes || []), entregadores: bucket(novosEntreg || []),
  }

  // Receita/pedidos por cidade (via localizacao da loja).
  const lojaCidade: Record<string, string> = {}
  for (const l of lojasRec || []) lojaCidade[l.id] = l.localizacao || '—'
  const porCidade: Record<string, { pedidos: number; receita: number }> = {}
  for (const p of pedidosCidade || []) {
    const c = lojaCidade[p.loja_id] || '—'
    if (!porCidade[c]) porCidade[c] = { pedidos: 0, receita: 0 }
    porCidade[c].pedidos++; porCidade[c].receita += Number(p.total) || 0
  }
  const cidadesReceita = Object.entries(porCidade).map(([cidade, v]) => ({ cidade, ...v })).sort((a, b) => b.receita - a.receita).slice(0, 15)

  return NextResponse.json({
    contadores: { comerciantes, clientes, entregadores, fornecedores, pedidos, fundadores, parceiros, receita, cidades: (cidades || []).length, embaixadores: (codigos || []).length },
    crescimento,
    listas: {
      lojas: lojasRec, clientes: clientesRec, entregadores: entregadoresRec,
      parceiros: parceirosRec, fundadores: fundadoresRec, embaixadores: codigos,
      pendentes,
    },
    cidades, cidadesReceita, flagsGlobais,
  })
}
