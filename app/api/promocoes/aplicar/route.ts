import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { rateLimit } from '../../../lib/rate-limit'
import {
  DIA_MS, REGRA_PADRAO, produtosElegiveis, produtoIdsDosItens,
  type ProdutoBase, type Regra,
} from '../../../lib/promocoes'

/**
 * Roda a regra de promoção automática da loja.
 *
 * Idempotente: encerra as promoções automáticas de produtos que voltaram a
 * vender e cria as que faltam. Chamar duas vezes seguidas não duplica nada
 * (índice único parcial `promocoes_produto_ativa_uniq`).
 */
export async function POST() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } },
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 })

  if (!rateLimit(`promocoes-aplicar:${user.id}`, 20, 60_000)) {
    return NextResponse.json({ erro: 'Muitas requisições' }, { status: 429 })
  }

  const { data: loja } = await supabase.from('lojas').select('id').eq('user_id', user.id).single()
  if (!loja) return NextResponse.json({ erro: 'Loja não encontrada' }, { status: 404 })

  const { data: regraRow } = await supabase
    .from('promocao_regras').select('ativa, dias_sem_venda, desconto_pct')
    .eq('loja_id', loja.id).maybeSingle()

  const regra: Regra = regraRow ?? REGRA_PADRAO
  if (!regra.ativa) {
    return NextResponse.json({ criadas: 0, encerradas: 0, motivo: 'regra_inativa' })
  }

  const desde = new Date(Date.now() - regra.dias_sem_venda * DIA_MS).toISOString()

  const [produtosRes, vendasRes, pedidosRes, ativasRes] = await Promise.all([
    supabase.from('produtos').select('id, nome, preco_venda, quantidade, created_at').eq('loja_id', loja.id),
    supabase.from('vendas').select('produto_id').eq('loja_id', loja.id).gte('created_at', desde),
    // Vendas via delivery contam: o produto pode estar girando só pelo app.
    supabase.from('pedidos_clientes').select('itens').eq('loja_id', loja.id)
      .neq('status', 'cancelado').gte('created_at', desde),
    supabase.from('promocoes').select('id, produto_id, origem').eq('loja_id', loja.id).eq('ativa', true),
  ])

  const produtos = (produtosRes.data || []) as ProdutoBase[]

  const vendidos = new Set<string>()
  for (const v of vendasRes.data || []) if (v.produto_id) vendidos.add(v.produto_id as string)
  for (const p of pedidosRes.data || []) for (const id of produtoIdsDosItens(p.itens)) vendidos.add(id)

  const ativas = ativasRes.data || []
  const promovidos = new Set(ativas.map(a => a.produto_id as string))

  // 1) Encerra promoções AUTOMÁTICAS de produtos que voltaram a vender.
  //    As manuais o comerciante encerra na mão.
  const paraEncerrar = ativas
    .filter(a => a.origem === 'automatica' && vendidos.has(a.produto_id as string))
    .map(a => a.id as string)

  if (paraEncerrar.length) {
    const { error } = await supabase.from('promocoes').update({ ativa: false }).in('id', paraEncerrar)
    if (error) {
      console.error('[promocoes/aplicar] falha ao encerrar:', error)
      return NextResponse.json({ erro: 'Falha ao encerrar promoções' }, { status: 500 })
    }
  }

  // 2) Cria promoções para os elegíveis que ainda não têm uma ativa.
  const elegiveis = produtosElegiveis(produtos, vendidos, regra).filter(p => !promovidos.has(p.id))

  let criadas = 0
  if (elegiveis.length) {
    const linhas = elegiveis.map(p => ({
      loja_id: loja.id,
      produto_id: p.id,
      desconto_pct: regra.desconto_pct,
      preco_original: Number(p.preco_venda),
      preco_promocional: p.precoPromocional,
      origem: 'automatica',
      ativa: true,
    }))
    const { data, error } = await supabase.from('promocoes').insert(linhas).select('id')
    if (error) {
      console.error('[promocoes/aplicar] falha ao criar:', error)
      return NextResponse.json({ erro: 'Falha ao criar promoções' }, { status: 500 })
    }
    criadas = data?.length ?? 0
  }

  return NextResponse.json({ criadas, encerradas: paraEncerrar.length })
}
