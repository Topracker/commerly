import {
  Package, ShoppingCart, Calendar, Scissors, Wallet, TrendingDown,
  Clock, Users, ClipboardList, Boxes, Truck, type LucideIcon,
} from 'lucide-react'

// ───────────────────────────────────────────────────────────────────────────
// Personalização de dashboard por nicho de comércio.
//
// Cada tipo de comércio escolhido no onboarding mapeia para um conjunto de
// "módulos" relevantes ao negócio. Esses módulos personalizam a sidebar e o
// dashboard. Todos apontam para rotas REAIS já existentes (ou /agenda e
// /servicos, criadas para os nichos de serviço).
//
// Para o tipo "Outro", a IA de onboarding sugere os módulos e eles ficam
// salvos por loja (ver lib/nicheStore.ts → nicho custom).
// ───────────────────────────────────────────────────────────────────────────

export type ModuloKey =
  | 'estoque'
  | 'produtos'
  | 'vendas'
  | 'pedidos'
  | 'agenda'
  | 'servicos'
  | 'fiado'
  | 'gastos'
  | 'historico'
  | 'funcionarios'
  | 'fornecedores'

export type Modulo = {
  key: ModuloKey
  label: string
  sub: string
  path: string
  icon: LucideIcon
  emoji: string
  /** Descrição curta usada nos cards de atalho do dashboard. */
  descricao: string
}

// Registry central de módulos. Note que alguns módulos compartilham a mesma
// rota com terminologia diferente (ex.: "Estoque" e "Produtos" → /produtos;
// "Pedidos" e "Vendas" → /vendas), pra falar a língua de cada nicho.
export const MODULOS: Record<ModuloKey, Modulo> = {
  estoque: {
    key: 'estoque', label: 'Estoque', sub: 'Produtos e quantidades', path: '/produtos',
    icon: Boxes, emoji: '📦', descricao: 'Controle o que entra e sai',
  },
  produtos: {
    key: 'produtos', label: 'Produtos', sub: 'Catálogo e preços', path: '/produtos',
    icon: Package, emoji: '🏷️', descricao: 'Gerencie seu catálogo',
  },
  vendas: {
    key: 'vendas', label: 'Vendas', sub: 'Registrar vendas', path: '/vendas',
    icon: ShoppingCart, emoji: '🛒', descricao: 'Registre cada venda',
  },
  pedidos: {
    key: 'pedidos', label: 'Pedidos', sub: 'Comandas e pedidos', path: '/vendas',
    icon: ClipboardList, emoji: '🧾', descricao: 'Acompanhe os pedidos',
  },
  agenda: {
    key: 'agenda', label: 'Agenda', sub: 'Horários e marcações', path: '/agenda',
    icon: Calendar, emoji: '📅', descricao: 'Organize os horários',
  },
  servicos: {
    key: 'servicos', label: 'Serviços', sub: 'Serviços e preços', path: '/servicos',
    icon: Scissors, emoji: '✂️', descricao: 'Defina seus serviços',
  },
  fiado: {
    key: 'fiado', label: 'Fiado', sub: 'Controlar fiados', path: '/fiado',
    icon: Wallet, emoji: '💳', descricao: 'Controle o que devem',
  },
  gastos: {
    key: 'gastos', label: 'Gastos', sub: 'Controlar despesas', path: '/gastos',
    icon: TrendingDown, emoji: '💸', descricao: 'Acompanhe as despesas',
  },
  historico: {
    key: 'historico', label: 'Histórico', sub: 'Ver todas as vendas', path: '/historico',
    icon: Clock, emoji: '🕑', descricao: 'Veja todo o histórico',
  },
  funcionarios: {
    key: 'funcionarios', label: 'Funcionários', sub: 'Gerenciar equipe', path: '/funcionarios',
    icon: Users, emoji: '👥', descricao: 'Gerencie a equipe',
  },
  fornecedores: {
    key: 'fornecedores', label: 'Fornecedores', sub: 'Reposição e contatos', path: '/fornecedores',
    icon: Truck, emoji: '🚚', descricao: 'Encontre fornecedores',
  },
}

// Vocabulário por nicho — relabela termos genéricos do dashboard.
export type Vocabulario = {
  vendas: string        // título do bloco de vendas (ex.: "Pedidos")
  ultimasVendas: string // título da lista de últimas vendas
  faturamento: string   // rótulo do card de faturamento
}

const VOCAB_PADRAO: Vocabulario = {
  vendas: 'Vendas',
  ultimasVendas: 'Últimas vendas',
  faturamento: 'Faturamento',
}

const VOCAB_PEDIDOS: Vocabulario = {
  vendas: 'Pedidos',
  ultimasVendas: 'Últimos pedidos',
  faturamento: 'Faturamento',
}

const VOCAB_ATENDIMENTOS: Vocabulario = {
  vendas: 'Atendimentos',
  ultimasVendas: 'Últimos atendimentos',
  faturamento: 'Faturamento',
}

export type Nicho = {
  emoji: string
  /** Módulos primários do negócio, em ordem de relevância. */
  modulos: ModuloKey[]
  /** Módulo em destaque — sobe no topo do dashboard. */
  destaque: 'estoque' | 'pedidos' | 'agenda' | 'vendas'
  vocab: Vocabulario
}

// Conjuntos reaproveitados entre nichos parecidos.
const COMIDA: Nicho = { emoji: '🍔', modulos: ['pedidos', 'produtos', 'fornecedores'], destaque: 'pedidos', vocab: VOCAB_PEDIDOS }
const VAREJO: Nicho = { emoji: '🛒', modulos: ['estoque', 'vendas', 'fornecedores'], destaque: 'estoque', vocab: VOCAB_PADRAO }
const SERVICO: Nicho = { emoji: '💈', modulos: ['agenda', 'servicos', 'vendas'], destaque: 'agenda', vocab: VOCAB_ATENDIMENTOS }

export const NICHOS: Record<string, Nicho> = {
  'Açougue': { ...VAREJO, emoji: '🥩' },
  'Barbearia': { ...SERVICO, emoji: '💈' },
  'Salão de Beleza': { ...SERVICO, emoji: '💅' },
  'Delivery': { ...COMIDA, emoji: '🛵', modulos: ['pedidos', 'produtos', 'fornecedores'] },
  'Restaurante': { ...COMIDA, emoji: '🍽️' },
  'Pizzaria': { ...COMIDA, emoji: '🍕' },
  'Hamburgueria': { ...COMIDA, emoji: '🍔' },
  'Lanchonete': { ...COMIDA, emoji: '🥪' },
  'Sorveteria': { ...COMIDA, emoji: '🍦' },
  'Padaria': { emoji: '🥐', modulos: ['vendas', 'estoque', 'fornecedores'], destaque: 'vendas', vocab: VOCAB_PADRAO },
  'Farmácia': { ...VAREJO, emoji: '💊' },
  'Mercado': { ...VAREJO, emoji: '🛒' },
  'Mercadinho': { ...VAREJO, emoji: '🏪' },
  'Hortifruti': { ...VAREJO, emoji: '🥦' },
  'Pet Shop': { emoji: '🐶', modulos: ['estoque', 'servicos', 'agenda'], destaque: 'estoque', vocab: VOCAB_PADRAO },
  'Distribuidora de bebidas': { ...VAREJO, emoji: '🍺' },
  'Eletrônicos': { emoji: '📱', modulos: ['estoque', 'vendas', 'servicos'], destaque: 'estoque', vocab: VOCAB_PADRAO },
  'Loja de roupas': { emoji: '👕', modulos: ['estoque', 'vendas', 'fornecedores'], destaque: 'estoque', vocab: VOCAB_PADRAO },
}

export const NICHO_PADRAO: Nicho = {
  emoji: '🏬',
  modulos: ['produtos', 'vendas', 'fornecedores'],
  destaque: 'vendas',
  vocab: VOCAB_PADRAO,
}

/** Retorna a config do nicho a partir do tipo escolhido no onboarding. */
export function getNicho(tipo?: string | null): Nicho {
  if (!tipo) return NICHO_PADRAO
  return NICHOS[tipo] || NICHO_PADRAO
}

/**
 * Resolve a lista de módulos (objetos) de uma loja.
 * - Nichos conhecidos usam a config estática.
 * - Para tipos custom (ex.: "Outro"), `modulosCustom` (vindo do nicheStore)
 *   tem prioridade.
 * Deduplica por rota pra não repetir o mesmo destino na sidebar.
 */
export function resolverModulos(tipo?: string | null, modulosCustom?: ModuloKey[] | null): Modulo[] {
  let keys: ModuloKey[]
  if (modulosCustom && modulosCustom.length) keys = modulosCustom
  else keys = getNicho(tipo).modulos

  const vistos = new Set<string>()
  const out: Modulo[] = []
  for (const k of keys) {
    const m = MODULOS[k]
    if (!m || vistos.has(m.path)) continue
    vistos.add(m.path)
    out.push(m)
  }
  return out
}

/** Validação usada pela IA de onboarding: filtra só keys válidas. */
export function modulosValidos(keys: unknown): ModuloKey[] {
  if (!Array.isArray(keys)) return []
  const validos = Object.keys(MODULOS) as ModuloKey[]
  return keys.filter((k): k is ModuloKey => typeof k === 'string' && validos.includes(k as ModuloKey))
}
