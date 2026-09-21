// Cupons de desconto (campanha de retorno, Commerly Garantia).
//
// Funções puras — usadas no server (geração) e no client (exibição).
//
// ONDE O CUPOM VALE (2026-09-20): só no Modo Festa, aplicado por quem criou a
// festa no fechamento. O rateio e o consumo são decididos no banco
// (`aplicar_cupom_festa`, sql/2026-09-20-cupom-modo-festa.sql) — nada aqui
// é autoridade sobre dinheiro; `descontoDoCupom` serve para texto e prévia.
//
// QUEM PAGA: cupom de retorno (`loja_id` preenchido) sai do valor que a
// própria loja recebe. Cupom da Garantia (`loja_id` nulo) é custo da
// Commerly — `cupom_usos.custeado_por = 'plataforma'`.

export type Cupom = {
  id: string
  codigo: string
  loja_id: string | null       // null = vale em qualquer loja Commerly
  tipo: 'percentual' | 'valor'
  valor: number
  minimo: number
  expira_em: string | null
  usado_em: string | null
  origem?: string
  festa_id?: string | null
  desconto_aplicado?: number | null
}

/** Texto do toggle "Aceito cupom no Modo Festa" nas configurações da loja. */
export const AVISO_CUPOM_LOJA =
  'Você só absorve o desconto dos cupons que você mesma criou (campanha "sentimos sua falta"): ' +
  'ele sai do valor do pedido, como no Clube de pontos. O cupom da Commerly Garantia (atraso na ' +
  'entrega) é bancado pela Commerly, não pela sua loja.'

/** Selo mostrado ao cliente na escolha de loja da festa. */
export const SELO_CUPOM = {
  aceita: 'Aceita cupom',
  naoAceita: 'Não aceita cupom',
} as const

export type CupomPreviaLoja = { loja_id: string | null; loja: string | null; motivo: 'nao_aceita' | 'outra_loja' }
export type CupomPreviaParticipante = {
  participante_id: string; participante: string; loja_id: string | null; loja: string | null
  base: number; elegivel: boolean; desconto?: number
}
/** Retorno de `festa_cupom_previa` (banco) — só informativo. */
export type CupomPrevia = {
  ok: boolean
  motivo?: string
  desconto_total: number
  valor_cheio?: number | null
  parcial?: boolean
  custeado_por?: 'loja' | 'plataforma'
  lojas_ignoradas: CupomPreviaLoja[]
  participantes: CupomPreviaParticipante[]
}
/** Retorno de `aplicar_cupom_festa` (banco). */
export type CupomAplicado = {
  ok: true
  cupom_id: string
  codigo: string
  desconto_total: number
  custeado_por: 'loja' | 'plataforma'
  parcial: boolean
  lojas_ignoradas: CupomPreviaLoja[]
  por_pedido: { pedido_id: string; loja_id: string; base: number; desconto: number }[]
}

/** Cupom listado para o cliente na festa (vem de /api/festa/cupons). */
export type CupomDoCliente = Cupom & { previa: CupomPrevia | null }

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
