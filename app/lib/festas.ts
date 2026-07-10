// Modo Festa: várias pessoas pedem de até 3 lojas próximas para UM endereço só,
// e um entregador leva tudo numa viagem. A taxa da viagem é rateada entre os
// participantes e o entregador ganha +20% de bônus (subsídio da plataforma).
//
// Ver as "decisões que valem dinheiro" em sql/2026-07-16-modo-festa.sql. Este
// arquivo concentra as constantes e a matemática do rateio (usadas na prévia do
// cliente e recalculadas no servidor ao fechar a festa — nunca confiamos no
// valor que o cliente manda).

export const FESTA_MAX_LOJAS = 3
export const FESTA_RAIO_LOJAS_KM = 2
export const FESTA_BONUS_PCT = 20
// Janela de vida da festa (o banco define expira_em = now()+6h por padrão).
export const FESTA_HORAS_VALIDADE = 6

export type FestaStatus = 'aberta' | 'fechada' | 'despachada' | 'cancelada'

export type FestaItem = {
  produto_id: string
  loja_id: string
  nome: string
  preco: number
  quantidade: number
}

export type Festa = {
  id: string
  criador_cliente_id: string
  nome: string
  codigo: string
  status: FestaStatus
  endereco_entrega: string
  entrega_latitude: number
  entrega_longitude: number
  taxa_total: number | null
  taxa_por_pessoa: number | null
  bonus_pct: number
  fechada_em: string | null
  expira_em: string
  created_at: string
}

export const FESTA_STATUS_META: Record<FestaStatus, { label: string; classes: string }> = {
  aberta:     { label: 'Aberta',     classes: 'bg-blue-500/15 text-blue-300 border-blue-500/40' },
  fechada:    { label: 'Fechada',    classes: 'bg-amber-500/15 text-amber-300 border-amber-500/40' },
  despachada: { label: 'A caminho',  classes: 'bg-purple-500/15 text-purple-300 border-purple-500/40' },
  cancelada:  { label: 'Cancelada',  classes: 'bg-red-500/15 text-red-400 border-red-500/40' },
}

// Alfabeto do código de convite: maiúsculas + dígitos, SEM 0/O/1/I (o convidado
// digita ou cola — ambiguidade só atrapalha).
const ALFABETO_CODIGO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

/** Gera um código de convite de 6 caracteres (não garante unicidade — o UNIQUE do banco garante; tente de novo em colisão). */
export function gerarCodigoFesta(tamanho = 6): string {
  let s = ''
  for (let i = 0; i < tamanho; i++) {
    s += ALFABETO_CODIGO[Math.floor(Math.random() * ALFABETO_CODIGO.length)]
  }
  return s
}

/** Normaliza um código digitado pelo convidado (maiúsculas, sem espaços). */
export function normalizarCodigo(v: string): string {
  return (v || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

/**
 * Taxa da festa rateada por pessoa. `taxaTotal` é a soma das pernas
 * loja→endereço (uma por loja participante); `nParticipantes` são os que têm
 * itens no fechamento. Nunca divide por zero.
 */
export function taxaPorPessoa(taxaTotal: number, nParticipantes: number): number {
  if (nParticipantes <= 0) return 0
  return Math.round((taxaTotal / nParticipantes) * 100) / 100
}

/** Valor da corrida de um pedido da festa: taxa rateada + bônus da plataforma. */
export function valorCorridaFesta(taxaRateada: number, bonusPct = FESTA_BONUS_PCT): number {
  return Math.round(taxaRateada * (1 + bonusPct / 100) * 100) / 100
}
