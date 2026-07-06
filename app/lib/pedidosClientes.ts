// Domínio dos pedidos do cliente para o comerciante (delivery).
// Distinto de lib/pedidos.ts (que é fornecedor → loja).

export type StatusPedidoCliente = 'recebido' | 'preparando' | 'saiu' | 'entregue' | 'cancelado'

export type ItemPedidoCliente = {
  produto_id: string
  nome: string
  preco: number
  quantidade: number
}

export type PedidoCliente = {
  id: string
  loja_id: string
  cliente_id: string
  itens: ItemPedidoCliente[]
  total: number
  taxa_entrega: number
  endereco_entrega: string
  // Ponto de entrega + distância loja→entrega (taxa calculada no servidor).
  entrega_latitude?: number | null
  entrega_longitude?: number | null
  distancia_km?: number | null
  observacao: string | null
  cliente_nome: string | null
  cliente_telefone: string | null
  status: StatusPedidoCliente
  // Pagamento do pedido pelo cliente: online (cartão via Stripe) ou na entrega.
  pagamento_metodo?: 'online' | 'entrega'
  pagamento_status?: 'pendente' | 'pago'
  // Entrega por entregador parceiro (opcional).
  entregador_id: string | null
  valor_corrida: number
  codigo_confirmacao: string | null
  pagamento_corrida: 'pendente' | 'pago'
  // Foto do comprovante de entrega (tirada pelo entregador ao confirmar).
  comprovante_entrega_url?: string | null
  created_at: string
  updated_at: string
}

// Fluxo de status em ordem (o comerciante avança um a um).
export const FLUXO_STATUS: StatusPedidoCliente[] = ['recebido', 'preparando', 'saiu', 'entregue']

export const STATUS_META: Record<StatusPedidoCliente, { label: string; emoji: string; classes: string; dot: string }> = {
  recebido:   { label: 'Recebido',          emoji: '🆕', classes: 'bg-blue-500/15 text-blue-300 border-blue-500/40',       dot: 'bg-blue-400' },
  preparando: { label: 'Preparando',        emoji: '👨‍🍳', classes: 'bg-amber-500/15 text-amber-300 border-amber-500/40',    dot: 'bg-amber-400' },
  saiu:       { label: 'Saiu para entrega', emoji: '🛵', classes: 'bg-purple-500/15 text-purple-300 border-purple-500/40', dot: 'bg-purple-400' },
  entregue:   { label: 'Entregue',          emoji: '✅', classes: 'bg-green-500/15 text-green-300 border-green-500/40',    dot: 'bg-green-400' },
  cancelado:  { label: 'Cancelado',         emoji: '✖️', classes: 'bg-red-500/15 text-red-400 border-red-500/40',          dot: 'bg-red-400' },
}

/** Próximo status no fluxo, ou null se já está no fim (ou cancelado). */
export function proximoStatus(atual: StatusPedidoCliente): StatusPedidoCliente | null {
  const i = FLUXO_STATUS.indexOf(atual)
  if (i === -1 || i >= FLUXO_STATUS.length - 1) return null
  return FLUXO_STATUS[i + 1]
}

// Nichos que aceitam pedido/entrega pelo app.
const NICHOS_DELIVERY = new Set(['Pizzaria', 'Hamburgueria', 'Lanchonete', 'Restaurante', 'Delivery'])

/** A loja é de um nicho que aceita pedidos de delivery pelo app? */
export function isDelivery(tipo?: string | null): boolean {
  return !!tipo && NICHOS_DELIVERY.has(tipo)
}

/** Considera "ativo" (em andamento) pra badges e contadores. */
export function pedidoEmAndamento(status: StatusPedidoCliente): boolean {
  return status !== 'entregue' && status !== 'cancelado'
}
