// Cupons de desconto (campanha de retorno, Clube Commerly).
//
// Funções puras — usadas no server (geração) e no client (aplicar no carrinho).

export type Cupom = {
  id: string
  codigo: string
  loja_id: string | null       // null = vale em qualquer loja Commerly
  tipo: 'percentual' | 'valor'
  valor: number
  minimo: number
  expira_em: string | null
  usado_em: string | null
}

// Sem 0/O/1/I: o cliente vai ler o código de um chat e digitar.
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

/** Código curto e legível, ex.: `VOLTA-7K3QXP`. */
export function gerarCodigo(prefixo = 'VOLTA'): string {
  let s = ''
  const bytes = new Uint8Array(6)
  crypto.getRandomValues(bytes)
  for (const b of bytes) s += ALFABETO[b % ALFABETO.length]
  return `${prefixo}-${s}`
}

export function cupomValido(c: Cupom, agora = Date.now()): boolean {
  if (c.usado_em) return false
  if (c.expira_em && new Date(c.expira_em).getTime() < agora) return false
  return true
}

/**
 * Desconto em reais que o cupom dá sobre `subtotal`.
 * Nunca passa do subtotal (cupom não vira crédito).
 */
export function descontoDoCupom(c: Cupom, subtotal: number): number {
  if (subtotal < c.minimo) return 0
  const bruto = c.tipo === 'percentual' ? subtotal * (c.valor / 100) : c.valor
  return Math.min(Math.round(bruto * 100) / 100, subtotal)
}

/** Texto do cupom no chat/mensagem (percentual ou valor fixo). */
export function descreveCupom(c: Pick<Cupom, 'tipo' | 'valor'>): string {
  return c.tipo === 'percentual'
    ? `${c.valor}% de desconto`
    : `R$ ${Number(c.valor).toFixed(2)} de desconto`
}
