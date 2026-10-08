// Modo Festa: várias pessoas pedem de até 3 lojas próximas para UM endereço só,
// e um entregador leva tudo numa viagem. A taxa da viagem é rateada entre os
// participantes e o entregador ganha +20% de bônus (subsídio da plataforma).
//
// Ver as "decisões que valem dinheiro" em sql/2026-07-16-modo-festa.sql. Este
// arquivo concentra as constantes e a matemática do rateio (usadas na prévia do
// cliente e recalculadas no servidor ao fechar a festa — nunca confiamos no
// valor que o cliente manda).

import { distanciaKm } from './geo'

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
  // Cupom usado no fechamento (lido de cupons.festa_id).
  cupom?: { id: string; codigo: string; desconto_aplicado: number; custeado_por: 'loja' | 'plataforma' } | null
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

export type LojaRaio = {
  nome: string
  latitude: number | null
  longitude: number | null
  distancia_maxima_entrega: number | string | null
}

/**
 * Primeira loja cujo raio de entrega (`distancia_maxima_entrega`) não alcança o
 * endereço da festa, com a mensagem pronta para o grupo — ou null se todas
 * alcançam. Mesma regra do guard do pedido comum (`dist > max_dist`, haversine);
 * loja sem limite ou sem coordenada não bloqueia, como lá.
 */
export function lojaForaDoRaio(
  lojas: LojaRaio[],
  entrega: { latitude: number | null; longitude: number | null },
): { loja: string; maxKm: number; distKm: number; mensagem: string } | null {
  for (const l of lojas) {
    if (l.distancia_maxima_entrega == null) continue
    const maxKm = Number(l.distancia_maxima_entrega)
    const distKm = distanciaKm(l, entrega)
    if (distKm == null || !Number.isFinite(maxKm) || distKm <= maxKm) continue
    const km = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })
    return {
      loja: l.nome,
      maxKm,
      distKm,
      mensagem: `${l.nome} entrega até ${km(maxKm)} km, e o endereço da festa está a ${km(distKm)} km. ` +
        'Escolha um endereço dentro da área de entrega ou outra loja.',
    }
  }
  return null
}

/** Valor da corrida de um pedido da festa: taxa rateada + bônus da plataforma. */
export function valorCorridaFesta(taxaRateada: number, bonusPct = FESTA_BONUS_PCT): number {
  return Math.round(taxaRateada * (1 + bonusPct / 100) * 100) / 100
}
