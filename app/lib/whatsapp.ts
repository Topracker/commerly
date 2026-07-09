// WhatsApp Commerce: link direto (wa.me) que abre a conversa da loja com o
// texto do pedido já preenchido.
//
// Funções puras — usadas em Server Components (/loja, /cardapio) e em Client
// Components (/cliente/loja). Não importe nada de server/React aqui.

import { soDigitos, validarTelefone } from './validacoes'

/** DDI do Brasil. O wa.me exige o número em formato internacional. */
export const DDI_BR = '55'

/**
 * Orçamento de caracteres do texto pré-preenchido. O wa.me carrega o texto na
 * query string; um cardápio de 200 itens viraria uma URL gigante que o app do
 * WhatsApp trunca no meio de um item. Cortamos antes, num limite previsível.
 */
export const MAX_TEXTO = 1200

export type ItemCardapio = { nome: string; preco: number }

const preco = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`

/**
 * Número pronto para o wa.me ("5562999999999"), ou `null` quando não dá para
 * montar um link confiável — melhor esconder o botão do que abrir uma conversa
 * com número errado.
 *
 * Aceita o número com ou sem DDI. Um número nacional tem 10 ou 11 dígitos, logo
 * 12/13 dígitos começando em "55" só podem ser DDI + nacional. Isso não conflita
 * com o DDD 55 (Santa Maria/RS): "(55) 3220-1234" tem 10 dígitos, não 12.
 */
export function numeroWhatsApp(valor?: string | null): string | null {
  const d = soDigitos(valor || '')
  if (!d) return null
  const nacional = (d.length === 12 || d.length === 13) && d.startsWith(DDI_BR) ? d.slice(2) : d
  if (!validarTelefone(nacional)) return null
  return DDI_BR + nacional
}

/** Link wa.me com texto pré-preenchido, ou `null` se o número não for válido. */
export function linkWhatsApp(valor: string | null | undefined, texto: string): string | null {
  const numero = numeroWhatsApp(valor)
  if (!numero) return null
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`
}

/** Texto padrão do "Pedir pelo WhatsApp". */
export function textoPedido(loja: string): string {
  return `Olá, quero fazer um pedido na ${loja}`
}

/**
 * Texto do cardápio: a saudação + os produtos disponíveis, um por linha.
 * Para de listar ao estourar MAX_TEXTO e diz quantos itens ficaram de fora, em
 * vez de cortar no meio de um nome.
 */
export function textoPedidoCardapio(loja: string, itens: ItemCardapio[]): string {
  const saudacao = textoPedido(loja)
  if (itens.length === 0) return saudacao

  const linhas: string[] = []
  let usados = 0
  for (const item of itens) {
    const linha = `• ${item.nome} — ${preco(item.preco)}`
    if (usados + linha.length + 1 > MAX_TEXTO) break
    linhas.push(linha)
    usados += linha.length + 1
  }

  const restantes = itens.length - linhas.length
  const rodape = restantes > 0
    ? `\n…e mais ${restantes} ${restantes === 1 ? 'item' : 'itens'} no cardápio.`
    : ''

  return `${saudacao}\n\nCardápio:\n${linhas.join('\n')}${rodape}`
}

/**
 * Número de contato da loja para o WhatsApp: o WhatsApp Business quando houver,
 * senão o telefone cadastrado. Assim as lojas que nunca preencheram o campo novo
 * continuam com o botão funcionando.
 */
export function whatsappDaLoja(loja: {
  whatsapp_business?: string | null
  telefone?: string | null
}): string | null {
  return numeroWhatsApp(loja.whatsapp_business) ? loja.whatsapp_business! : loja.telefone ?? null
}
