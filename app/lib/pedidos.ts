export type StatusPedido = 'pendente' | 'aceito' | 'recusado' | 'entregue'

export type ItemPedido = {
  produto_id: string
  nome: string
  preco: number
  quantidade: number
}

export type Pedido = {
  id: string
  loja_id: string
  fornecedor_id: string
  itens: ItemPedido[]
  total: number
  observacao: string | null
  status: StatusPedido
  created_at: string
  updated_at: string
}

export const STATUS_META: Record<StatusPedido, { label: string; classes: string }> = {
  pendente: { label: 'Pendente', classes: 'bg-yellow-900/50 text-yellow-300' },
  aceito:   { label: 'Aceito',   classes: 'bg-blue-900/50 text-blue-300' },
  recusado: { label: 'Recusado', classes: 'bg-red-900/50 text-red-400' },
  entregue: { label: 'Entregue', classes: 'bg-green-900/50 text-green-300' },
}
