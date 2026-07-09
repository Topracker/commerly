// Combos inteligentes: descobre quais produtos os clientes compram JUNTOS
// (market-basket) e sugere vender o par como combo com desconto.
//
// Funções puras — a página /combos passa os pedidos já carregados.

import { produtoIdsDosItens } from './promocoes'

export const MIN_VEZES_JUNTOS = 3   // abaixo disso é coincidência, não padrão
export const DESCONTO_PADRAO = 10

export type Par = {
  a: string
  b: string
  vezes: number        // pedidos em que os dois apareceram juntos
  confianca: number    // 0-1: dos pedidos com o produto menos frequente, % que levou o outro
}

export type ProdutoRef = { id: string; nome: string; preco_venda: number }

export type Sugestao = {
  produtoIds: [string, string]
  nome: string
  vezes: number
  confianca: number
  precoCheio: number
  precoCombo: number
  economia: number
}

/** Cesta de um pedido: ids únicos (comprar 3x o mesmo item não é "junto"). */
export function cestaDoPedido(itens: unknown): string[] {
  return [...new Set(produtoIdsDosItens(itens))]
}

/**
 * Conta co-ocorrências entre pares de produtos nas cestas.
 * Ordena por `vezes` desc. Pares abaixo de `minVezes` são descartados.
 */
export function contarPares(cestas: string[][], minVezes = MIN_VEZES_JUNTOS): Par[] {
  const individuais = new Map<string, number>()
  const pares = new Map<string, number>()

  for (const cesta of cestas) {
    for (const id of cesta) individuais.set(id, (individuais.get(id) ?? 0) + 1)

    // Ordena para a chave do par ser estável (a<b) e não contar duas vezes.
    const ordenada = [...cesta].sort()
    for (let i = 0; i < ordenada.length; i++) {
      for (let j = i + 1; j < ordenada.length; j++) {
        const chave = `${ordenada[i]}|${ordenada[j]}`
        pares.set(chave, (pares.get(chave) ?? 0) + 1)
      }
    }
  }

  const out: Par[] = []
  for (const [chave, vezes] of pares) {
    if (vezes < minVezes) continue
    const [a, b] = chave.split('|')
    // Confiança conservadora: sobre o produto que aparece MENOS. Se A e B
    // aparecem juntos sempre que o mais raro dos dois aparece, confiança = 1.
    const menor = Math.min(individuais.get(a) ?? 0, individuais.get(b) ?? 0)
    out.push({ a, b, vezes, confianca: menor > 0 ? vezes / menor : 0 })
  }
  return out.sort((x, y) => y.vezes - x.vezes || y.confianca - x.confianca)
}

/** Monta as sugestões de combo a partir dos pares, com preço já descontado. */
export function sugerirCombos(
  pares: Par[],
  produtos: ProdutoRef[],
  descontoPct = DESCONTO_PADRAO,
): Sugestao[] {
  const mapa = new Map(produtos.map(p => [p.id, p]))
  const out: Sugestao[] = []

  for (const par of pares) {
    const pa = mapa.get(par.a)
    const pb = mapa.get(par.b)
    // Produto apagado depois do pedido: ignora o par.
    if (!pa || !pb) continue

    const precoCheio = Number(pa.preco_venda) + Number(pb.preco_venda)
    if (precoCheio <= 0) continue
    const precoCombo = Math.max(0.01, Math.round(precoCheio * (1 - descontoPct / 100) * 100) / 100)

    out.push({
      produtoIds: [pa.id, pb.id],
      nome: `${pa.nome} + ${pb.nome}`,
      vezes: par.vezes,
      confianca: par.confianca,
      precoCheio,
      precoCombo,
      economia: Math.round((precoCheio - precoCombo) * 100) / 100,
    })
  }
  return out
}
