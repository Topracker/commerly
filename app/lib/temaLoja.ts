import { getNicho } from './nichos'

// Tema visual por nicho de comércio (gradiente do banner + emoji) e emoji por
// categoria de produto. Usado nas páginas da loja (cliente e pública).
//
// As classes de gradiente são strings COMPLETAS (não interpoladas) para o
// Tailwind detectá-las na varredura e não removê-las no build.

const GRADIENTES: Record<string, string> = {
  'Açougue': 'from-red-700/40 via-gray-900 to-rose-950/40',
  'Barbearia': 'from-blue-800/40 via-gray-900 to-slate-800/50',
  'Salão de Beleza': 'from-pink-600/40 via-gray-900 to-fuchsia-800/30',
  'Delivery': 'from-orange-600/40 via-gray-900 to-amber-800/30',
  'Restaurante': 'from-amber-600/40 via-gray-900 to-orange-800/30',
  'Pizzaria': 'from-red-600/40 via-gray-900 to-orange-700/30',
  'Hamburgueria': 'from-amber-600/40 via-gray-900 to-yellow-800/30',
  'Lanchonete': 'from-orange-500/40 via-gray-900 to-amber-700/30',
  'Sorveteria': 'from-pink-500/40 via-gray-900 to-cyan-700/30',
  'Padaria': 'from-amber-500/40 via-gray-900 to-yellow-700/30',
  'Farmácia': 'from-emerald-600/40 via-gray-900 to-teal-800/30',
  'Mercado': 'from-green-600/40 via-gray-900 to-emerald-800/30',
  'Mercadinho': 'from-green-600/40 via-gray-900 to-lime-800/30',
  'Hortifruti': 'from-lime-600/40 via-gray-900 to-green-800/30',
  'Pet Shop': 'from-amber-600/40 via-gray-900 to-orange-900/40',
  'Distribuidora de bebidas': 'from-yellow-600/40 via-gray-900 to-amber-800/30',
  'Eletrônicos': 'from-cyan-600/40 via-gray-900 to-blue-800/30',
  'Loja de roupas': 'from-indigo-600/40 via-gray-900 to-purple-800/30',
}

const GRAD_PADRAO = 'from-blue-600/30 via-gray-900 to-green-600/20'

/** Classes de gradiente temático do nicho (sem o prefixo `bg-gradient-to-*`). */
export function gradienteNicho(tipo?: string | null): string {
  if (tipo && GRADIENTES[tipo]) return GRADIENTES[tipo]
  return GRAD_PADRAO
}

// Gradientes em hex (3 paradas) para o banner hero — precisão de cor por nicho.
const GRADIENTES_HEX: Record<string, [string, string, string]> = {
  'Açougue': ['#7A2A11', '#C1441E', '#E0632C'],
  'Barbearia': ['#16222E', '#24405C', '#3A6EA5'],
  'Salão de Beleza': ['#4A1533', '#9D2A6B', '#D14D8F'],
  'Delivery': ['#7A3B0E', '#C56A1E', '#E8912C'],
  'Restaurante': ['#6B3410', '#B5711E', '#E0A02C'],
  'Pizzaria': ['#7A1F14', '#C13A1E', '#E8632C'],
  'Hamburgueria': ['#6B3410', '#B5811E', '#E0B02C'],
  'Lanchonete': ['#7A3B0E', '#C56A1E', '#E8A02C'],
  'Sorveteria': ['#6B2A4A', '#C14D8F', '#4DB8D1'],
  'Padaria': ['#6B4410', '#B5901E', '#E0C02C'],
  'Farmácia': ['#0E4A3B', '#1E8C6E', '#2CC199'],
  'Mercado': ['#0E4A2A', '#1E8C4E', '#2CC16E'],
  'Mercadinho': ['#0E4A2A', '#4E8C1E', '#8CC12C'],
  'Hortifruti': ['#2A4A0E', '#6E8C1E', '#9DC12C'],
  'Pet Shop': ['#4A2E0E', '#8C5E1E', '#C1852C'],
  'Distribuidora de bebidas': ['#6B5410', '#B5901E', '#E8B82C'],
  'Eletrônicos': ['#0E2E4A', '#1E5E8C', '#2C9DC1'],
  'Loja de roupas': ['#2A1A4A', '#5E2A8C', '#8C4DC1'],
}

const HEX_PADRAO: [string, string, string] = ['#12303A', '#1E5E5C', '#2C8C6E']

/** Paradas de cor (hex) do gradiente temático do nicho. */
export function gradienteHexNicho(tipo?: string | null): [string, string, string] {
  if (tipo && GRADIENTES_HEX[tipo]) return GRADIENTES_HEX[tipo]
  return HEX_PADRAO
}

/** Cor de acento (parada mais viva) do nicho — para glows/detalhes. */
export function corAcentoNicho(tipo?: string | null): string {
  return gradienteHexNicho(tipo)[2]
}

/** Emoji do nicho (reaproveita a config de nichos do dashboard). */
export function emojiNicho(tipo?: string | null): string {
  return getNicho(tipo).emoji
}

// Palpites de emoji por categoria de produto (texto livre). Primeiro match vence.
const CATEGORIA_EMOJI: [RegExp, string][] = [
  [/cervej|chopp/i, '🍺'],
  [/bebi|refri|suco|[áa]gua|drink|vinho|whisky|energ/i, '🥤'],
  [/caf[ée]|ch[áa]\b/i, '☕'],
  [/leite|latic|queij|iogur/i, '🧀'],
  [/carne|a[çc]ou|frango|boi|lingu|picanha|costel|su[íi]n/i, '🥩'],
  [/p[ãa]o|padar|bolo|confei|torta|croiss/i, '🍞'],
  [/sorvet|a[çc]a[íi]|gelad|picol/i, '🍦'],
  [/doce|sobrem|chocola|bombom|brigad|bala/i, '🍬'],
  [/pizza/i, '🍕'],
  [/hamb|lanch|salg|coxinh|past[eé]l|hot ?dog|burg/i, '🍔'],
  [/fruta|verdura|legum|horti|salada/i, '🥦'],
  [/limpez|higien|sab[ãa]o|deterg|amaciant/i, '🧼'],
  [/rem[ée]di|medicam|farm|sa[úu]de|vitamin/i, '💊'],
  [/roupa|camis|cal[çc]a|vestu|moda|blusa|cal[çc]ad|sapat|t[êe]nis|acess[óo]ri/i, '👕'],
  [/eletr[ôo]|celular|fone|cabo|carreg|note|tv|inform/i, '📱'],
  [/pet|ra[çc][ãa]o|animal|c[ãa]o|gato/i, '🐾'],
  [/beleza|cabelo|maqui|cosm[ée]|perfum|unha/i, '💄'],
]

/** Emoji da categoria; cai no emoji do nicho quando não reconhece a categoria. */
export function emojiCategoria(categoria?: string | null, tipo?: string | null): string {
  if (categoria) {
    for (const [re, emoji] of CATEGORIA_EMOJI) if (re.test(categoria)) return emoji
  }
  return emojiNicho(tipo)
}
