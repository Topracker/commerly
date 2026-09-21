// Acertos em DINHEIRO do delivery — Caminho B (2026-09-20).
//
// A Commerly NÃO intermedia o dinheiro do pedido pago na entrega. Ela registra
// quem deve quanto a quem (ledger append-only `acertos_dinheiro`) e colhe a
// confirmação das partes (`acertos_confirmacoes`). A REGRA ÚNICA, que vale para
// FAQ, modal da oferta, card do entregador e painel da loja:
//
//   cliente paga o TOTAL ao entregador
//     → entregador fica com a TAXA DE ENTREGA (a corrida dele)
//     → entregador repassa TOTAL − TAXA à loja
//     → a loja CONFIRMA que recebeu → pagamento_status = 'pago'.
//   Sem entregador (a loja entregou), marcar "entregue" já é a confirmação.
//
// Nada aqui é autoridade sobre dinheiro: as linhas nascem no banco (trigger
// `acertos_gerar_na_entrega`, sql/2026-09-20-acertos-dinheiro.sql) e a rota
// /api/acertos/confirmar (service role) é quem escreve a confirmação. Este
// arquivo tem tipos, rótulos e a matemática de exibição.

export type PapelAcerto = 'cliente' | 'entregador' | 'loja' | 'commerly'
export type TipoAcerto = 'cobranca' | 'repasse_loja' | 'bonus_festa' | 'cupom_garantia' | 'estorno'
export type PapelConfirmacao = 'loja' | 'entregador' | 'commerly'

export type Acerto = {
  id: string
  pedido_id: string
  festa_id: string | null
  loja_id: string
  entregador_id: string | null
  cliente_id: string | null
  de_papel: PapelAcerto
  para_papel: PapelAcerto
  tipo: TipoAcerto
  valor: number
  estorna_id: string | null
  origem: string
  referencia_externa: string | null
  created_at: string
}

export type AcertoConfirmacao = {
  id: string
  acerto_id: string
  papel: PapelConfirmacao
  resultado: 'confirmado' | 'contestado'
  user_id: string | null
  origem: string
  observacao: string | null
  referencia_externa: string | null
  created_at: string
}

/** Acerto com as confirmações embutidas (PostgREST: `acertos_confirmacoes(*)`). */
export type AcertoComConfirmacoes = Acerto & { acertos_confirmacoes?: AcertoConfirmacao[] | null }

export type SituacaoAcerto = 'pendente' | 'confirmado' | 'contestado'

export const PAPEL_LABEL: Record<PapelAcerto, string> = {
  cliente: 'Cliente', entregador: 'Entregador', loja: 'Loja', commerly: 'Commerly',
}

export const TIPO_LABEL: Record<TipoAcerto, string> = {
  cobranca: 'Cobrado em dinheiro',
  repasse_loja: 'Repasse à loja',
  bonus_festa: 'Bônus do Modo Festa',
  cupom_garantia: 'Cupom da Commerly Garantia',
  estorno: 'Estorno',
}

/** Texto do rádio "Pagar na entrega" no pedido (regra única, em uma linha). */
export const TEXTO_PAGAR_NA_ENTREGA = 'Dinheiro ou Pix direto com o entregador. Peça troco se precisar.'

/** Resumo da regra para a FAQ (3 papéis). */
export const REGRA_DINHEIRO =
  'O cliente paga o total ao entregador na porta. O entregador fica com a taxa de entrega (a corrida dele) ' +
  'e repassa o restante — o valor dos produtos — para a loja. A loja confirma o recebimento no painel; ' +
  'só então o pedido aparece como pago. A Commerly não intermedia esse dinheiro, apenas registra o acerto ' +
  'para os dois lados verem a mesma conta.'

export const reais = (v: number) => `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/** Troco que o entregador precisa levar (0 quando não há troco). */
export function trocoDevido(trocoPara: number | null | undefined, total: number): number {
  if (trocoPara == null) return 0
  return Math.max(0, Math.round((Number(trocoPara) - Number(total)) * 100) / 100)
}

/** O que o entregador repassa à loja depois de ficar com a taxa. */
export function repasseLoja(total: number, taxaEntrega: number): number {
  return Math.max(0, Math.round((Number(total) - Number(taxaEntrega)) * 100) / 100)
}

/** Situação de um acerto do ponto de vista de quem RECEBE (`para_papel`). */
export function situacaoAcerto(a: AcertoComConfirmacoes): SituacaoAcerto {
  const confs = a.acertos_confirmacoes || []
  if (confs.some(c => c.papel === a.para_papel && c.resultado === 'confirmado')) return 'confirmado'
  if (confs.some(c => c.resultado === 'contestado')) return 'contestado'
  return 'pendente'
}

export const SITUACAO_META: Record<SituacaoAcerto, { label: string; classes: string }> = {
  pendente:   { label: 'Aguardando confirmação', classes: 'bg-amber-500/15 text-amber-300 border-amber-500/40' },
  confirmado: { label: 'Confirmado',             classes: 'bg-green-500/15 text-green-300 border-green-500/40' },
  contestado: { label: 'Contestado',             classes: 'bg-red-500/15 text-red-400 border-red-500/40' },
}

/**
 * Linha-resumo do que o entregador faz na porta, usada no modal da oferta e no
 * card da entrega. Ex.: "Cobrar R$ 33,79 em dinheiro · troco R$ 16,21 · repassar R$ 26,96 à loja".
 */
export function resumoCobranca(p: { total: number; taxa_entrega: number; troco_para?: number | null }): string {
  const partes = [`Cobrar ${reais(p.total)} em dinheiro`]
  const troco = trocoDevido(p.troco_para, p.total)
  if (troco > 0) partes.push(`troco ${reais(troco)} (cliente paga com ${reais(p.troco_para as number)})`)
  partes.push(`repassar ${reais(repasseLoja(p.total, p.taxa_entrega))} à loja`)
  return partes.join(' · ')
}

/** Chips de "paga com" oferecidos no pedido: as notas comuns acima do total. */
export function sugestoesTroco(total: number): number[] {
  return [20, 50, 100, 200].filter(n => n > total)
}

/** Espelha a validação do guard (troco_para ≥ total e não absurdo). Devolve a mensagem de erro ou null. */
export function validarTroco(trocoPara: number | null, total: number): string | null {
  if (trocoPara == null) return null
  if (!Number.isFinite(trocoPara) || trocoPara <= 0) return 'Informe um valor válido para o troco.'
  if (trocoPara < total) return `O valor precisa ser pelo menos o total do pedido (${reais(total)}).`
  if (trocoPara > total + 500) return 'Valor para troco muito alto.'
  return null
}
