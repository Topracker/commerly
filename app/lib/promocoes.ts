// Promoções automáticas: "produto sem vender há X dias ganha Y% de desconto".
//
// Funções puras — os dados entram prontos (rota /api/promocoes/aplicar e a
// página /promocoes). Não importe React/Next aqui.

export const DIA_MS = 86_400_000

export type Regra = {
  ativa: boolean
  dias_sem_venda: number
  desconto_pct: number
}

export const REGRA_PADRAO: Regra = { ativa: false, dias_sem_venda: 30, desconto_pct: 10 }

export type ProdutoBase = {
  id: string
  nome: string
  preco_venda: number
  quantidade: number
  created_at: string
}

export type Elegivel = ProdutoBase & {
  diasParado: number
  precoPromocional: number
}

/** Preço com `pct`% de desconto, arredondado a 2 casas (nunca abaixo de R$ 0,01). */
export function precoComDesconto(preco: number, pct: number): number {
  const p = Math.round(preco * (1 - pct / 100) * 100) / 100
  return Math.max(0.01, p)
}

/**
 * Produtos que a regra promove.
 *
 * Elegível = tem estoque, NÃO vendeu dentro da janela, e já existe há pelo menos
 * a janela inteira. O último critério evita descontar um produto cadastrado
 * ontem só porque ele ainda não vendeu.
 *
 * `vendidosNaJanela` deve incluir vendas de balcão E de delivery — senão um
 * produto que só vende pelo app entraria em promoção sem necessidade.
 */
export function produtosElegiveis(
  produtos: ProdutoBase[],
  vendidosNaJanela: Set<string>,
  regra: Regra,
  agora: number = Date.now(),
): Elegivel[] {
  const janelaMs = regra.dias_sem_venda * DIA_MS

  return produtos
    .filter(p => (p.quantidade ?? 0) > 0)
    .filter(p => !vendidosNaJanela.has(p.id))
    .filter(p => agora - new Date(p.created_at).getTime() >= janelaMs)
    .map(p => ({
      ...p,
      diasParado: Math.floor((agora - new Date(p.created_at).getTime()) / DIA_MS),
      precoPromocional: precoComDesconto(Number(p.preco_venda), regra.desconto_pct),
    }))
    .sort((a, b) => b.diasParado - a.diasParado)
}

/** Extrai os produto_id de um `pedidos_clientes.itens` (jsonb). */
export function produtoIdsDosItens(itens: unknown): string[] {
  if (!Array.isArray(itens)) return []
  return itens
    .map(i => (i as { produto_id?: unknown })?.produto_id)
    .filter((id): id is string => typeof id === 'string')
}
