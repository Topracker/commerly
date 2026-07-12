import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '../../lib/supabase-admin'
import { perfilSlug } from '../../lib/crescimento'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Ranking público. Params:
//  papel: comerciantes | entregadores | clientes | embaixadores | cidades
//  periodo: hoje | semana | mes | ano | geral
//  escopo: brasil | cidade  (cidade usa &cidade=<localizacao>)
//  uf: filtro opcional para papel=cidades

function desde(periodo: string): string | null {
  const now = new Date()
  switch (periodo) {
    case 'hoje': return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
    case 'semana': return new Date(now.getTime() - 7 * 86400000).toISOString()
    case 'mes': return new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    case 'ano': return new Date(now.getFullYear(), 0, 1).toISOString()
    default: return null
  }
}

export async function GET(request: NextRequest) {
  const admin = createAdminClient()
  const sp = request.nextUrl.searchParams
  const papel = sp.get('papel') || 'comerciantes'
  const periodo = sp.get('periodo') || 'geral'
  const escopo = sp.get('escopo') || 'brasil'
  const cidade = sp.get('cidade') || ''
  const uf = sp.get('uf') || ''
  const de = desde(periodo)

  // ---- Cidades: direto da corrida de expansão ----
  if (papel === 'cidades') {
    let q = admin.from('cidades_expansao').select('nome, uf, slug, pontos, meta_pontos, status').order('pontos', { ascending: false }).limit(50)
    if (uf) q = q.eq('uf', uf)
    const { data } = await q
    return NextResponse.json({
      papel, periodo, itens: (data || []).map((c: any) => ({
        nome: `${c.nome}/${c.uf}`, valor: c.pontos, unidade: 'pontos', extra: c.status, href: `/expansao/${c.slug}`,
      })),
    })
  }

  // ---- Embaixadores: indicações confirmadas por indicador ----
  if (papel === 'embaixadores') {
    let q = admin.from('indicacoes').select('indicador_user_id, created_at').in('status', ['confirmada', 'recompensada'])
    if (de) q = q.gte('created_at', de)
    const { data } = await q.limit(10000)
    const cont: Record<string, number> = {}
    for (const r of data || []) cont[r.indicador_user_id] = (cont[r.indicador_user_id] || 0) + 1
    const ids = Object.keys(cont).sort((a, b) => cont[b] - cont[a]).slice(0, 50)
    const [{ data: lojas }, { data: cli }, { data: ent }] = await Promise.all([
      admin.from('lojas').select('user_id, nome').in('user_id', ids.length ? ids : ['-']),
      admin.from('clientes').select('user_id, nome').in('user_id', ids.length ? ids : ['-']),
      admin.from('entregadores').select('user_id, nome').in('user_id', ids.length ? ids : ['-']),
    ])
    const nome: Record<string, string> = {}
    for (const l of lojas || []) nome[l.user_id] = l.nome
    for (const x of cli || []) if (!nome[x.user_id]) nome[x.user_id] = x.nome
    for (const x of ent || []) if (!nome[x.user_id]) nome[x.user_id] = x.nome
    return NextResponse.json({
      papel, periodo, itens: ids.map(id => ({ nome: nome[id] || 'Embaixador', valor: cont[id], unidade: 'indicações' })),
    })
  }

  // ---- Comerciantes / Entregadores / Clientes: por pedidos ----
  // Restringe às lojas da cidade (escopo=cidade) ou do estado (uf) quando pedido.
  let lojaIdsCidade: string[] | null = null
  if (escopo === 'cidade' && cidade) {
    const { data } = await admin.from('lojas').select('id').eq('localizacao', cidade)
    lojaIdsCidade = (data || []).map((l: any) => l.id)
    if (lojaIdsCidade.length === 0) return NextResponse.json({ papel, periodo, itens: [] })
  } else if (uf) {
    const { data } = await admin.from('lojas').select('id').eq('uf', uf)
    lojaIdsCidade = (data || []).map((l: any) => l.id)
    if (lojaIdsCidade.length === 0) return NextResponse.json({ papel, periodo, itens: [] })
  }

  let q = admin.from('pedidos_clientes').select('loja_id, cliente_id, entregador_id, created_at, status').neq('status', 'cancelado')
  if (de) q = q.gte('created_at', de)
  if (papel === 'entregadores') q = q.eq('status', 'entregue')
  if (lojaIdsCidade) q = q.in('loja_id', lojaIdsCidade)
  const { data: pedidos } = await q.limit(20000)

  const campo = papel === 'entregadores' ? 'entregador_id' : papel === 'clientes' ? 'cliente_id' : 'loja_id'
  const cont: Record<string, number> = {}
  for (const p of pedidos || []) {
    const k = (p as any)[campo]
    if (k) cont[k] = (cont[k] || 0) + 1
  }
  const ids = Object.keys(cont).sort((a, b) => cont[b] - cont[a]).slice(0, 50)

  const tabela = papel === 'entregadores' ? 'entregadores' : papel === 'clientes' ? 'clientes' : 'lojas'
  const sel = papel === 'comerciantes' ? 'id, nome, localizacao' : 'id, nome'
  const { data: entidades } = await admin.from(tabela).select(sel).in('id', ids.length ? ids : ['-'])
  const map: Record<string, any> = {}
  for (const e of (entidades || []) as any[]) map[e.id] = e
  const unidade = papel === 'entregadores' ? 'entregas' : 'pedidos'
  const papelSlug = papel === 'entregadores' ? 'entregador' : papel === 'clientes' ? 'cliente' : 'comerciante'

  const itens = ids.filter(id => map[id]).map(id => {
    const e = map[id]
    return {
      nome: papel === 'clientes' ? (e.nome?.split(' ')[0] || 'Cliente') : e.nome,
      valor: cont[id], unidade,
      extra: e.localizacao || undefined,
      href: `/${papelSlug}/${perfilSlug(e.nome || papelSlug, id)}`,
    }
  })
  return NextResponse.json({ papel, periodo, itens })
}
