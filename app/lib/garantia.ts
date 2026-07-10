// #10 Commerly Garantia — atraso > 30min do ETA gera cupom de 10% ao cliente.
//
// O cupom é da PLATAFORMA (`loja_id = null`), não da loja: o atraso pode ser da
// cozinha, do entregador ou do trânsito, e penalizar o comerciante por chuva na
// avenida seria injusto. O custo do cupom é da Commerly.

/** Tolerância sobre o ETA antes de considerar atraso. */
export const TOLERANCIA_MIN = 30
/** Desconto do cupom de garantia, em %. */
export const DESCONTO_PCT = 10
/** Validade do cupom. */
export const VALIDADE_DIAS = 30

export const ORIGEM = 'garantia'

/** Instante a partir do qual o pedido conta como atrasado. */
export function prazoEstourado(etaEm: string | Date, agora: Date = new Date()): boolean {
  const eta = typeof etaEm === 'string' ? new Date(etaEm) : etaEm
  if (Number.isNaN(eta.getTime())) return false
  return agora.getTime() > eta.getTime() + TOLERANCIA_MIN * 60_000
}

/**
 * ETA prometido ao cliente: preparo da loja + deslocamento estimado.
 * Gravado em `pedidos_clientes.eta_em` no momento em que o pedido é criado —
 * é a promessa contra a qual a garantia é medida, e não pode ser reescrita
 * depois (senão a loja "consertaria" o atraso mexendo no prazo).
 */
export function calcularEta(tempoPreparoMin: number, etaEntregaMin: number | null, criadoEm: Date = new Date()): Date {
  const total = Math.max(1, tempoPreparoMin) + Math.max(0, etaEntregaMin ?? 0)
  return new Date(criadoEm.getTime() + total * 60_000)
}

export function expiraEm(agora: Date = new Date()): Date {
  return new Date(agora.getTime() + VALIDADE_DIAS * 24 * 60 * 60_000)
}

export const TITULO_PUSH = 'Sentimos pelo atraso!'
export const MENSAGEM_PUSH = `Seu pedido atrasou. Aceite nossas desculpas: ${DESCONTO_PCT}% no próximo pedido 🎁`
