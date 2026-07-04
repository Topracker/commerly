// Programa de fidelidade do cliente.
//
// Regras (espelhadas no SQL — sql/2026-07-04-fidelidade.sql):
//   - Ganha 1 ponto por R$ 1 gasto em produtos (a taxa de entrega NÃO pontua).
//   - Resgate em blocos de 100 pontos = R$ 5 de desconto (1 ponto = R$ 0,05).
//   - O nível é global (soma dos pontos do cliente em todas as lojas).
//
// NÃO importe nada de React/Next aqui — usado no client (dashboard, modal) e
// pode ser reusado no server.

export const PONTOS_POR_REAL = 1
export const PONTOS_POR_BLOCO = 100      // resgate em múltiplos de 100
export const DESCONTO_POR_BLOCO = 5      // R$ por bloco de 100 pontos

export type Nivel = {
  nome: 'Bronze' | 'Prata' | 'Ouro' | 'Diamante'
  emoji: string
  cor: string         // cor de destaque (hex) para o badge
  minimo: number      // pontos acumulados (total) para atingir o nível
  proximo: number | null // pontos do próximo nível (null = topo)
}

// Ordem crescente. O nível do cliente é o maior cujo `minimo` ele alcançou.
const NIVEIS: Omit<Nivel, 'proximo'>[] = [
  { nome: 'Bronze', emoji: '🥉', cor: '#B87333', minimo: 0 },
  { nome: 'Prata', emoji: '🥈', cor: '#C0C7D1', minimo: 500 },
  { nome: 'Ouro', emoji: '🥇', cor: '#F5C34B', minimo: 2000 },
  { nome: 'Diamante', emoji: '💎', cor: '#6FD4E8', minimo: 5000 },
]

// Nível do cliente a partir do total de pontos acumulados.
export function nivelDoCliente(totalPontos: number): Nivel {
  const t = Math.max(0, Math.floor(totalPontos || 0))
  let idx = 0
  for (let i = 0; i < NIVEIS.length; i++) {
    if (t >= NIVEIS[i].minimo) idx = i
  }
  const atual = NIVEIS[idx]
  const prox = NIVEIS[idx + 1]
  return { ...atual, proximo: prox ? prox.minimo : null }
}

// R$ de desconto para uma quantidade de pontos (arredonda para baixo ao bloco).
export function descontoDePontos(pontos: number): number {
  const blocos = Math.floor(Math.max(0, pontos) / PONTOS_POR_BLOCO)
  return blocos * DESCONTO_POR_BLOCO
}

// Máximo de pontos resgatáveis num pedido: limitado pelo saldo (em blocos de
// 100) e pelo subtotal (não dá pra descontar mais do que o valor dos produtos).
export function maxPontosResgataveis(saldo: number, subtotal: number): number {
  const blocosSaldo = Math.floor(Math.max(0, saldo) / PONTOS_POR_BLOCO)
  const blocosSubtotal = Math.floor(Math.max(0, subtotal) / DESCONTO_POR_BLOCO)
  return Math.min(blocosSaldo, blocosSubtotal) * PONTOS_POR_BLOCO
}
