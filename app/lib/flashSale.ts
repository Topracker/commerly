// #13 Commerly B2C Flash — promoção-relâmpago do fornecedor, com countdown.

export type FlashSale = {
  id: string
  fornecedor_id: string
  produto_id: string | null
  titulo: string
  desconto_percentual: number
  inicia_em: string
  termina_em: string
}

/** Duração padrão da promoção. */
export const DURACAO_PADRAO_MIN = 60
export const DESCONTO_MIN = 1
export const DESCONTO_MAX = 90

export function estaAtiva(f: Pick<FlashSale, 'inicia_em' | 'termina_em'>, agora: Date = new Date()): boolean {
  const t = agora.getTime()
  return new Date(f.inicia_em).getTime() <= t && t < new Date(f.termina_em).getTime()
}

/** Milissegundos até o fim. Zero quando já acabou. */
export function restanteMs(f: Pick<FlashSale, 'termina_em'>, agora: Date = new Date()): number {
  return Math.max(0, new Date(f.termina_em).getTime() - agora.getTime())
}

/** "12:34" — minutos e segundos restantes. Acima de 1h, inclui a hora. */
export function formatarCountdown(ms: number): string {
  if (ms <= 0) return '00:00'
  const total = Math.floor(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const dd = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${dd(h)}:${dd(m)}:${dd(s)}` : `${dd(m)}:${dd(s)}`
}

export function precoComDesconto(preco: number, descontoPct: number): number {
  return Math.round(preco * (1 - descontoPct / 100) * 100) / 100
}
