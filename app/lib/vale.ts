// Vale-alimentação / vale-refeição (VA/VR) — 2026-10-31.
//
// A Commerly NÃO processa o vale. O cliente paga na MAQUININHA DA LOJA, na
// porta (o entregador leva a maquininha) ou quando a loja entrega. É mais uma
// forma de pagamento "na entrega", igual dinheiro (Caminho B, lib/acertos.ts),
// com uma diferença que muda o acerto:
//
//   dinheiro: o cliente paga o entregador → ele fica com a taxa e repassa o
//             resto à loja (repasse_loja, entregador → loja).
//   vale:     o dinheiro cai direto na conta da LOJA (é a maquininha dela) →
//             a loja confirma que o vale passou (cobranca, cliente → loja) e
//             deve a corrida ao entregador (repasse_entregador, loja → entregador).
//
// Autoridade no banco (sql/2026-10-31-vale-alimentacao.sql): o trigger
// `pedidos_vale_guard` recusa vale em loja que não aceita / bandeira que ela não
// marcou e congela os campos no UPDATE; `acertos_gerar_na_entrega` gera o ledger.
// Este arquivo tem rótulos, tipos e a matemática de exibição.

import { reais } from './moeda'

export const BANDEIRAS_VALE = ['alelo', 'vr', 'ticket', 'pluxee', 'caju', 'flash', 'outros'] as const
export type BandeiraVale = typeof BANDEIRAS_VALE[number]

export const ROTULO_BANDEIRA: Record<BandeiraVale, string> = {
  alelo: 'Alelo',
  vr: 'VR',
  ticket: 'Ticket',
  pluxee: 'Pluxee (Sodexo)',
  caju: 'Caju',
  flash: 'Flash',
  outros: 'Outros',
}

/** Rótulo da forma de pagamento no CAIXA (vendas.forma_pagamento é texto livre). */
export const FORMA_VALE_CAIXA = 'Vale (VA/VR)'

/** Formas oferecidas no registro de venda do caixa. */
export const FORMAS_CAIXA = ['Dinheiro', 'Pix', 'Cartão', FORMA_VALE_CAIXA] as const

export const AVISO_MAQUININHA = 'Você paga na maquininha do entregador/da loja.'

export function rotuloBandeira(b: string | null | undefined): string {
  return (b && ROTULO_BANDEIRA[b as BandeiraVale]) || 'Vale'
}

/** Bandeiras válidas, na ordem do catálogo (descarta lixo vindo do banco). */
export function bandeirasValidas(xs: unknown): BandeiraVale[] {
  if (!Array.isArray(xs)) return []
  return BANDEIRAS_VALE.filter(b => xs.includes(b))
}

export function listaBandeiras(xs: unknown): string {
  return bandeirasValidas(xs).map(b => ROTULO_BANDEIRA[b]).join(', ')
}

/** O pedido é no vale? (`forma_pagamento` só existe depois da migração.) */
export function pedidoNoVale(p: { pagamento_metodo?: string | null; forma_pagamento?: string | null }): boolean {
  return p.pagamento_metodo !== 'online' && p.forma_pagamento === 'vale'
}

/** "Pagamento: VALE (Alelo)" — o destaque do card da loja e do entregador. */
export function destaqueVale(bandeira: string | null | undefined): string {
  return `Pagamento: VALE (${rotuloBandeira(bandeira)})`
}

/**
 * O que o entregador faz na porta num pedido no vale. Ex.:
 * "Cobrar R$ 42,00 no vale Alelo na maquininha da loja · a loja te paga a corrida (R$ 6,00)".
 */
export function resumoCobrancaVale(p: { total: number; taxa_entrega: number; vale_bandeira?: string | null }): string {
  const partes = [`Cobrar ${reais(p.total)} no vale ${rotuloBandeira(p.vale_bandeira)} na maquininha da loja`]
  if (Number(p.taxa_entrega) > 0) partes.push(`a loja te paga a corrida (${reais(Number(p.taxa_entrega))})`)
  return partes.join(' · ')
}

// ---------------------------------------------------------------------------
// Resumo por forma de pagamento (financeiro)
// ---------------------------------------------------------------------------

export type FormaResumo = 'Dinheiro' | 'Pix' | 'Cartão' | typeof FORMA_VALE_CAIXA | 'Maquininha' | 'Online (app)' | 'Na entrega (dinheiro/Pix)' | 'Outras'

/** Venda do caixa/integração → forma do resumo. A maquininha vem separada, seja crédito, débito ou Pix. */
export function formaDaVenda(forma: string | null | undefined, origem?: string | null): FormaResumo {
  if (origem?.startsWith('maquininha_')) return 'Maquininha'
  const f = (forma || '').trim().toLowerCase()
  if (!f) return 'Outras'
  if (f.startsWith('vale')) return FORMA_VALE_CAIXA
  if (f === 'dinheiro') return 'Dinheiro'
  if (f === 'pix') return 'Pix'
  if (f.startsWith('cart') || f.includes('crédito') || f.includes('débito') || f.includes('credit') || f.includes('debit')) return 'Cartão'
  return 'Outras'
}

/** Pedido do delivery → forma do resumo. */
export function formaDoPedido(p: { pagamento_metodo?: string | null; forma_pagamento?: string | null }): FormaResumo {
  if (p.pagamento_metodo === 'online') return 'Online (app)'
  if (p.forma_pagamento === 'vale') return FORMA_VALE_CAIXA
  return 'Na entrega (dinheiro/Pix)'
}

/** Ordem fixa de exibição; o vale vem destacado por último entre as do balcão. */
export const ORDEM_FORMAS: FormaResumo[] = ['Dinheiro', 'Pix', 'Cartão', FORMA_VALE_CAIXA, 'Maquininha', 'Na entrega (dinheiro/Pix)', 'Online (app)', 'Outras']
