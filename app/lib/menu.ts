// Estrutura do menu lateral do comerciante, em seções colapsáveis.
//
// Os itens fixos vivem aqui. Os módulos POR NICHO (Agenda, Serviços, Vendas...)
// vêm de `useNicho` e são encaixados na seção certa por `key` — sem isso, uma
// barbearia perderia a Agenda ao trocarmos o menu plano por seções.

import type { LucideIcon } from 'lucide-react'
import {
  Home, Bell, ShoppingBag, Package, Tag, Layers, Clock, UserRound, MessageCircle,
  Send, Landmark, TrendingDown, Wallet, Megaphone, Users, Truck, GraduationCap,
  Sparkles, Gauge, Plug, Settings, Crown, MessageSquare, Rss,
} from 'lucide-react'
import type { Modulo } from './nichos'

/** Contadores que o AppLayout pendura no item. */
export type BadgeKey = 'notificacoes' | 'pedidos' | 'mensagens' | 'agenda'

export type ItemMenu = {
  label: string
  sub?: string
  path: string
  icon: LucideIcon
  badge?: BadgeKey
}

export type SecaoMenu = {
  chave: string
  titulo: string
  itens: ItemMenu[]
}

/**
 * "Campanha de retorno" e "Commerly Score" não são rotas: são seções dentro de
 * /clientes e /dashboard. Linkamos via âncora — os `id` correspondentes existem
 * nessas páginas.
 */
const PRINCIPAL: ItemMenu[] = [
  { label: 'Dashboard', path: '/dashboard', icon: Home },
  { label: 'Notificações', sub: 'Pedidos e avisos', path: '/notificacoes', icon: Bell, badge: 'notificacoes' },
]

const PRODUTOS_VENDAS: ItemMenu[] = [
  { label: 'Produtos', sub: 'Catálogo e preços', path: '/produtos', icon: Package },
  { label: 'Promoções', sub: 'Descontos automáticos', path: '/promocoes', icon: Tag },
  { label: 'Combos', sub: 'Sugestões do que vende junto', path: '/combos', icon: Layers },
  { label: 'Histórico', sub: 'Ver todas as vendas', path: '/historico', icon: Clock },
]

const CLIENTES: ItemMenu[] = [
  { label: 'Feed da loja', sub: 'Posts, stories e métricas', path: '/posts', icon: Rss },
  { label: 'Clientes', sub: 'CRM — quem já comprou', path: '/clientes', icon: UserRound },
  { label: 'Mensagens', sub: 'Chat com clientes e fornecedores', path: '/mensagens', icon: MessageCircle, badge: 'mensagens' },
  { label: 'Campanha de retorno', sub: 'Trazer clientes de volta', path: '/clientes#campanha-retorno', icon: Send },
]

const FINANCEIRO: ItemMenu[] = [
  { label: 'Financeiro', sub: 'Fluxo de caixa, lucro real e DAS', path: '/financeiro', icon: Landmark },
  { label: 'Gastos', sub: 'Controlar despesas', path: '/gastos', icon: TrendingDown },
  { label: 'Fiado', sub: 'Controlar fiados', path: '/fiado', icon: Wallet },
  { label: 'Commerly Ads', sub: 'Destaque sua loja na busca', path: '/ads', icon: Megaphone },
]

const EQUIPE: ItemMenu[] = [
  { label: 'Funcionários', sub: 'Gerenciar equipe', path: '/funcionarios', icon: Users },
  { label: 'Fornecedores', sub: 'Reposição e contatos', path: '/fornecedores', icon: Truck },
]

const CRESCIMENTO: ItemMenu[] = [
  { label: 'Academy', sub: 'Mini aulas para vender mais', path: '/academy', icon: GraduationCap },
  { label: 'Assistente IA', sub: 'Perguntas sobre a loja', path: '/assistente', icon: Sparkles },
  { label: 'Commerly Score', sub: 'Saúde do seu negócio', path: '/dashboard#commerly-score', icon: Gauge },
]

const CONFIGURACOES: ItemMenu[] = [
  { label: 'Integrações', sub: 'MP e PagBank', path: '/integracoes', icon: Plug },
  { label: 'Configurações', sub: 'Editar dados da loja', path: '/configuracoes', icon: Settings },
  { label: 'Meu Plano', sub: 'Assinatura', path: '/planos', icon: Crown },
  { label: 'Feedback', sub: 'Enviar sugestão', path: '/feedback', icon: MessageSquare },
]

/** Onde cada módulo de nicho entra, quando não é coberto por um item fixo. */
const SECAO_DO_MODULO: Record<string, string> = {
  estoque: 'produtos-vendas',
  produtos: 'produtos-vendas',
  vendas: 'produtos-vendas',
  pedidos: 'produtos-vendas',
  historico: 'produtos-vendas',
  agenda: 'principal',
  servicos: 'principal',
  fiado: 'financeiro',
  gastos: 'financeiro',
  fornecedores: 'equipe',
  funcionarios: 'equipe',
}

const BADGE_DA_ROTA: Record<string, BadgeKey> = {
  '/agenda': 'agenda',
}

/**
 * Monta as seções para uma loja.
 *
 * `delivery` acrescenta "Pedidos online" e descarta o módulo `pedidos` do nicho
 * (que aponta para /vendas e duplicaria o conceito) — mesma regra do menu antigo.
 *
 * Módulos cujo `path` já aparece num item fixo são descartados: para uma
 * hamburgueria, o módulo `produtos` é o mesmo /produtos da seção fixa.
 */
export function montarMenu({ delivery, modulos }: { delivery: boolean; modulos: Modulo[] }): SecaoMenu[] {
  const secoes: SecaoMenu[] = [
    { chave: 'principal', titulo: 'Principal', itens: [...PRINCIPAL] },
    { chave: 'produtos-vendas', titulo: 'Produtos e Vendas', itens: [...PRODUTOS_VENDAS] },
    { chave: 'clientes', titulo: 'Clientes', itens: [...CLIENTES] },
    { chave: 'financeiro', titulo: 'Financeiro', itens: [...FINANCEIRO] },
    { chave: 'equipe', titulo: 'Equipe', itens: [...EQUIPE] },
    { chave: 'crescimento', titulo: 'Crescimento', itens: [...CRESCIMENTO] },
    { chave: 'configuracoes', titulo: 'Configurações', itens: [...CONFIGURACOES] },
  ]

  if (delivery) {
    secoes[0].itens.push({
      label: 'Pedidos online', sub: 'Entregas dos clientes', path: '/pedidos', icon: ShoppingBag, badge: 'pedidos',
    })
  }

  const porChave = new Map(secoes.map(s => [s.chave, s]))
  const rotasFixas = new Set(secoes.flatMap(s => s.itens.map(i => i.path)))

  for (const m of modulos) {
    if (delivery && m.key === 'pedidos') continue
    if (rotasFixas.has(m.path)) continue
    const secao = porChave.get(SECAO_DO_MODULO[m.key] ?? 'principal')
    if (!secao) continue
    secao.itens.push({
      label: m.label, sub: m.sub, path: m.path, icon: m.icon as LucideIcon, badge: BADGE_DA_ROTA[m.path],
    })
    rotasFixas.add(m.path)
  }

  return secoes.filter(s => s.itens.length > 0)
}

/** Seção que contém a rota atual (para abri-la por padrão). */
export function secaoDaRota(secoes: SecaoMenu[], pathname: string): string | null {
  for (const s of secoes) {
    if (s.itens.some(i => i.path.split('#')[0] === pathname)) return s.chave
  }
  return null
}
