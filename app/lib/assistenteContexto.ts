// Contexto do Assistente IA do lojista (/api/assistente).
//
// Tudo o que a IA sabe vem daqui: instruções de tom, guia do app (montado do
// menu REAL da loja + FAQ da Central de Ajuda), links públicos da loja e os
// números do negócio. A rota só autentica e chama o Gemini.
//
// Segurança: recebe o client da SESSÃO do lojista (RLS) e a loja dele; nada
// aqui lê outra loja, token ou segredo. Os links são montados com o id da
// própria loja sobre a URL pública do site.

import type { SupabaseClient } from '@supabase/supabase-js'
import { formatarData, inicioMesLoja } from './datas'
import { CATEGORIAS_FAQ } from './faq'
import { montarMenu } from './menu'
import { resolverModulos } from './nichos'
import { isDelivery } from './pedidosClientes'
import { perfilSlug } from './crescimento'
import { SITE_URL } from './site'

export type LojaAssistente = { id: string; nome: string; tipo: string | null }

/** Links públicos da loja (cardápio, página da loja, perfil público). */
export function linksDaLoja(loja: LojaAssistente, base: string = SITE_URL) {
  return {
    cardapio: `${base}/cardapio/${loja.id}`,
    loja: `${base}/loja/${loja.id}`,
    // Todo comerciante tem perfil público: o slug é "nome-id" (lib/crescimento).
    perfil: `${base}/comerciante/${perfilSlug(loja.nome, loja.id)}`,
  }
}

/**
 * Passos das tarefas mais comuns, com os nomes reais dos botões. Só entra o
 * passo cuja tela está no menu da loja (o menu muda por nicho).
 */
const PASSOS: { path: string; texto: string }[] = [
  { path: '/vendas', texto: 'Registrar venda: menu Produtos e Vendas → Vendas, escolha o produto e a quantidade, toque em "Adicionar produto", escolha Dinheiro, Pix ou Cartão e toque em "Confirmar venda". O estoque baixa sozinho.' },
  { path: '/fiado', texto: 'Registrar fiado: menu Financeiro → Fiado → botão "Novo fiado", preencha o nome do cliente e o valor. Quando o cliente pagar, toque em "Pago".' },
  { path: '/gastos', texto: 'Registrar gasto: menu Financeiro → Gastos → botão "Novo gasto", com descrição e valor.' },
  { path: '/historico', texto: 'Ver vendas antigas: menu Produtos e Vendas → Histórico.' },
  { path: '/produtos', texto: 'Cadastrar produto ou preço: menu Produtos e Vendas → Produtos. Todo produto cadastrado entra no cardápio digital.' },
  { path: '/integracoes', texto: 'Conectar Mercado Pago ou PagBank: menu Configurações → Integrações.' },
  { path: '/planos', texto: 'Ver ou pagar a assinatura: menu Configurações → Meu Plano.' },
  { path: '/pedidos', texto: 'Pedidos de delivery: menu Principal → Pedidos online. Área de entrega, tempo de preparo e WhatsApp ficam em Configurações.' },
]

/** Guia de uso montado do menu desta loja + FAQ do comerciante. */
export function guiaDoApp(loja: LojaAssistente): string {
  const delivery = isDelivery(loja.tipo)
  const secoes = montarMenu({ delivery, modulos: resolverModulos(loja.tipo) })
  const rotas = new Set(secoes.flatMap(s => s.itens.map(i => i.path)))

  const menu = secoes
    .map(s => `- ${s.titulo}: ${s.itens.map(i => (i.sub ? `${i.label} (${i.sub})` : i.label)).join('; ')}`)
    .join('\n')

  const passos = PASSOS.filter(p => rotas.has(p.path)).map(p => `- ${p.texto}`)
  passos.push(
    delivery
      ? '- QR code do cardápio: em Configurações (para imprimir) ou no Dashboard → "Kit de marketing".'
      : '- QR code do cardápio: no Dashboard → "Kit de marketing".',
  )
  if (!delivery) passos.push('- Delivery (pedidos online com entregador) só existe para lojas de comida. Esta loja não tem delivery.')

  const faq = CATEGORIAS_FAQ.flatMap(c => c.perguntas)
    .filter(p => p.publico.includes('comerciante'))
    .map(p => `P: ${p.pergunta}\nR: ${p.resposta.replace(/\n\n/g, ' ')}${p.link ? ` (tela: ${p.link.label})` : ''}`)
    .join('\n\n')

  return `MENU DESTA LOJA (barra lateral, por seção):
${menu}

COMO FAZER:
${passos.join('\n')}

PERGUNTAS FREQUENTES (Central de Ajuda):
${faq}`
}

const brl = (n: number) => `R$ ${n.toFixed(2).replace('.', ',')}`

type Venda = {
  valor_total: number | null; lucro: number | null; quantidade: number | null
  descricao: string | null; forma_pagamento: string | null; created_at: string
  produtos: { nome: string } | null
}

/** Números da loja: mês atual (fuso da loja) e últimos 30 dias. */
export async function dadosDaLoja(supabase: SupabaseClient, lojaId: string): Promise<string> {
  const inicioMes = inicioMesLoja()
  const trintaDias = new Date(Date.now() - 30 * 86_400_000)
  const desde = (inicioMes < trintaDias ? inicioMes : trintaDias).toISOString()

  const [vendasRes, gastosRes, produtosRes, fiadoRes] = await Promise.all([
    supabase.from('vendas').select('valor_total, lucro, quantidade, descricao, forma_pagamento, created_at, produtos(nome)')
      .eq('loja_id', lojaId).gte('created_at', desde).order('created_at', { ascending: false }).limit(1000),
    supabase.from('gastos').select('descricao, valor, created_at')
      .eq('loja_id', lojaId).gte('created_at', desde).order('created_at', { ascending: false }),
    supabase.from('produtos').select('nome, quantidade, quantidade_minima').eq('loja_id', lojaId),
    supabase.from('fiado').select('cliente_nome, valor, descricao')
      .eq('loja_id', lojaId).eq('pago', false).order('created_at', { ascending: false }),
  ])

  const vendas = (vendasRes.data || []) as unknown as Venda[]
  const gastos = gastosRes.data || []
  const produtos = produtosRes.data || []
  const fiado = fiadoRes.data || []

  const noMes = <T extends { created_at: string }>(l: T[]) => l.filter(x => new Date(x.created_at) >= inicioMes)
  const em30 = <T extends { created_at: string }>(l: T[]) => l.filter(x => new Date(x.created_at) >= trintaDias)
  const soma = <T>(l: T[], f: (x: T) => number | null) => l.reduce((a, x) => a + (f(x) || 0), 0)

  const periodo = (titulo: string, v: Venda[], g: typeof gastos) => {
    const fat = soma(v, x => x.valor_total)
    const lucro = soma(v, x => x.lucro)
    const gas = soma(g, x => x.valor)
    return `${titulo}:
- Vendas registradas: ${v.length}
- Faturamento: ${brl(fat)}
- Lucro bruto: ${brl(lucro)}
- Gastos: ${brl(gas)}
- Resultado líquido: ${brl(lucro - gas)}`
  }

  const topMap: Record<string, { nome: string; quantidade: number; lucro: number }> = {}
  for (const v of em30(vendas)) {
    const nome = v.produtos?.nome || v.descricao || 'Produto'
    topMap[nome] ??= { nome, quantidade: 0, lucro: 0 }
    topMap[nome].quantidade += v.quantidade || 1
    topMap[nome].lucro += v.lucro || 0
  }
  const top5 = Object.values(topMap).sort((a, b) => b.quantidade - a.quantidade).slice(0, 5)
  const estoqueBaixo = produtos.filter(p => p.quantidade <= (p.quantidade_minima || 0))
  const totalFiado = soma(fiado, f => f.valor)

  return `${periodo(`MÊS ATUAL (desde ${formatarData(inicioMes)})`, noMes(vendas), noMes(gastos))}

${periodo('ÚLTIMOS 30 DIAS', em30(vendas), em30(gastos))}

FIADO EM ABERTO: ${brl(totalFiado)} (${fiado.length} registros)
${fiado.slice(0, 10).map(f => `- ${f.cliente_nome}: ${brl(f.valor || 0)} — ${f.descricao || ''}`).join('\n')}${fiado.length > 10 ? `\n... e mais ${fiado.length - 10}` : ''}

TOP 5 PRODUTOS (30 dias):
${top5.length ? top5.map((p, i) => `${i + 1}. ${p.nome}: ${p.quantidade} un., ${brl(p.lucro)} de lucro`).join('\n') : 'Nenhuma venda registrada'}

ESTOQUE (${produtos.length} produtos):
${produtos.slice(0, 20).map(p => `- ${p.nome}: ${p.quantidade} un. (mínimo ${p.quantidade_minima || 0})`).join('\n')}${produtos.length > 20 ? `\n... e mais ${produtos.length - 20}` : ''}
${estoqueBaixo.length ? `Estoque baixo: ${estoqueBaixo.map(p => p.nome).join(', ')}` : 'Nenhum produto abaixo do mínimo.'}

ÚLTIMAS 10 VENDAS:
${vendas.slice(0, 10).map(v => `- ${v.produtos?.nome || v.descricao || 'Produto'}: ${v.quantidade || 1}x, ${brl(v.valor_total || 0)} (${v.forma_pagamento || 'N/A'}) em ${formatarData(v.created_at)}`).join('\n') || 'Nenhuma'}

GASTOS RECENTES:
${gastos.slice(0, 10).map(g => `- ${g.descricao}: ${brl(g.valor || 0)} em ${formatarData(g.created_at)}`).join('\n') || 'Nenhum'}`
}

/** Instrução de sistema completa para o Gemini. */
export async function instrucaoAssistente(supabase: SupabaseClient, loja: LojaAssistente): Promise<string> {
  const links = linksDaLoja(loja)
  const dados = await dadosDaLoja(supabase, loja.id)

  return `Você é o assistente da Commerly, um app de gestão para pequenos comércios. Você está ajudando o dono da loja "${loja.nome}" (tipo: ${loja.tipo || 'não informado'}).

COMO RESPONDER:
- Responda DIRETO o que foi perguntado. Comece pela resposta, sem introdução.
- Português do Brasil, simples e amigável. Frases curtas. Use lista só quando ajudar.
- Só fale de números (vendas, lucro, gastos, fiado, estoque) se a pessoa perguntar de números, desempenho ou pedir um resumo. Nunca repita o resumo financeiro sem ser pedido.
- "Este mês" = MÊS ATUAL. Use os valores exatos dos dados; não invente números.
- Para dúvidas de uso do app, diga o caminho no menu (seção → item → botão), usando o guia abaixo.
- Não invente funções, telas ou botões que não estão no guia. Se não souber, diga em qual item do menu procurar ou indique a Central de Ajuda (Suporte).
- Se a pessoa só cumprimentar, cumprimente de volta em uma frase e pergunte como pode ajudar.

LINKS PÚBLICOS DESTA LOJA (pode passar para o lojista):
- Cardápio digital: ${links.cardapio}
- Página da loja: ${links.loja}
- Perfil público: ${links.perfil}

GUIA DO APP
${guiaDoApp(loja)}

DADOS DA LOJA (use só se a pergunta pedir)
${dados}`
}
