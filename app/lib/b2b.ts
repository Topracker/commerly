// Marketplace B2B: comerciante compra do fornecedor.
// A Commerly retém 5% de comissão no pagamento (Stripe Connect, destination
// charge com application_fee).
//
// Funções puras — usadas no server (checkout) e no client (comparação).

export const COMISSAO_PCT = 5

export type ItemPedidoB2B = {
  produto_id: string
  nome: string
  preco: number
  quantidade: number
}

/** Comissão da plataforma, em reais (2 casas). */
export function calcularComissao(total: number): number {
  return Math.round(total * (COMISSAO_PCT / 100) * 100) / 100
}

/** Comissão em centavos — é o que o Stripe pede em `application_fee_amount`. */
export function comissaoEmCentavos(total: number): number {
  return Math.round(total * (COMISSAO_PCT / 100) * 100)
}

export function totalDosItens(itens: ItemPedidoB2B[]): number {
  return Math.round(itens.reduce((a, i) => a + i.preco * i.quantidade, 0) * 100) / 100
}

// ─── Comparação de preços entre fornecedores ────────────────────────────────

export type OfertaFornecedor = {
  produto_id: string
  fornecedor_id: string
  fornecedor_nome: string
  nome: string
  preco: number
  unidade: string
  minimo_pedido: number
  estoque: number | null
}

export type GrupoComparacao = {
  chave: string             // nome normalizado do produto
  nome: string              // nome como o 1º fornecedor escreveu
  ofertas: OfertaFornecedor[]  // da mais barata pra mais cara
  menorPreco: number
  maiorPreco: number
  economia: number          // quanto se economiza indo no mais barato
}

/** Combining diacritical marks (U+0300-U+036F): sobram depois do normalize NFD. */
const DIACRITICOS = /[̀-ͯ]/g

/** Normaliza o nome pra agrupar "Coca-Cola 2L" e "coca cola 2l" no mesmo item. */
export function normalizarNome(nome: string): string {
  return nome
    .toLowerCase()
    .normalize('NFD').replace(DIACRITICOS, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * Agrupa ofertas pelo nome normalizado do produto.
 * Só devolve grupos com 2+ fornecedores — comparar preço de um só não ajuda.
 */
export function compararOfertas(ofertas: OfertaFornecedor[]): GrupoComparacao[] {
  const grupos = new Map<string, OfertaFornecedor[]>()
  for (const o of ofertas) {
    const chave = normalizarNome(o.nome)
    if (!chave) continue
    const atual = grupos.get(chave)
    if (atual) atual.push(o)
    else grupos.set(chave, [o])
  }

  const out: GrupoComparacao[] = []
  for (const [chave, lista] of grupos) {
    // Mesmo fornecedor com dois cadastros iguais não conta como concorrência.
    const fornecedores = new Set(lista.map(o => o.fornecedor_id))
    if (fornecedores.size < 2) continue

    const ordenadas = [...lista].sort((a, b) => a.preco - b.preco)
    const menorPreco = ordenadas[0].preco
    const maiorPreco = ordenadas[ordenadas.length - 1].preco
    out.push({
      chave,
      nome: ordenadas[0].nome,
      ofertas: ordenadas,
      menorPreco,
      maiorPreco,
      economia: Math.round((maiorPreco - menorPreco) * 100) / 100,
    })
  }

  // Maior economia primeiro: é onde comparar compensa mais.
  return out.sort((a, b) => b.economia - a.economia)
}
