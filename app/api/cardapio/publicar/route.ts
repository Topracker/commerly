// Publicação do rascunho de cardápio (#2 e #3). O comerciante revisou os itens
// na tela; aqui eles viram linhas em `produtos`.
//
// Usa o cliente com a sessão do usuário (não service role): a RLS de `produtos`
// já garante que ele só escreve na própria loja.

import { NextRequest, NextResponse } from 'next/server'
import { rateLimit } from '../../../lib/rate-limit'
import { supabaseDaRota, usuarioDaRota, lojaDoUsuario } from '../../../lib/rotaSupabase'
import { MAX_ITENS_RASCUNHO, type ItemRascunho } from '../../../lib/cardapioIA'

export const runtime = 'nodejs'

type Entrada = Partial<ItemRascunho>

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const brutos: Entrada[] = Array.isArray(body?.itens) ? body.itens : []

  if (brutos.length === 0) return NextResponse.json({ erro: 'Nenhum item para publicar.' }, { status: 400 })
  if (brutos.length > MAX_ITENS_RASCUNHO) {
    return NextResponse.json({ erro: `Máximo de ${MAX_ITENS_RASCUNHO} itens por vez.` }, { status: 400 })
  }

  const supabase = await supabaseDaRota()
  const user = await usuarioDaRota(supabase)
  if (!user) return NextResponse.json({ erro: 'Faça login.' }, { status: 401 })

  const loja = await lojaDoUsuario(supabase, user.id)
  if (!loja) return NextResponse.json({ erro: 'Loja não encontrada.' }, { status: 403 })

  if (!rateLimit(`cardapio-publicar:${user.id}`, 20, 60 * 60_000)) {
    return NextResponse.json({ erro: 'Muitas publicações seguidas.' }, { status: 429 })
  }

  // O rascunho passou pela UI do comerciante; ainda assim revalidamos tudo aqui,
  // porque a requisição pode vir montada à mão.
  const linhas: Record<string, unknown>[] = []
  for (const b of brutos) {
    const nome = typeof b.nome === 'string' ? b.nome.trim().slice(0, 80) : ''
    const preco = typeof b.preco_venda === 'number' ? b.preco_venda : Number(b.preco_venda)

    if (!nome) return NextResponse.json({ erro: 'Todo item precisa de nome.' }, { status: 400 })
    if (!Number.isFinite(preco) || preco <= 0) {
      return NextResponse.json({ erro: `Preço inválido em "${nome}". Preencha antes de publicar.` }, { status: 400 })
    }

    linhas.push({
      loja_id: loja.id,
      nome,
      descricao: typeof b.descricao === 'string' ? b.descricao.trim().slice(0, 300) || null : null,
      categoria: typeof b.categoria === 'string' ? b.categoria.trim().slice(0, 40) || null : null,
      preco_venda: Math.round(preco * 100) / 100,
      quantidade: 0,
    })
  }

  const { data, error } = await supabase.from('produtos').insert(linhas).select('id')
  if (error) {
    console.error('[cardapio/publicar] insert falhou:', error.message)
    return NextResponse.json({ erro: 'Não foi possível salvar os produtos.' }, { status: 500 })
  }

  return NextResponse.json({ criados: data?.length ?? 0 })
}
