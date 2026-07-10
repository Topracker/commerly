// Preço dinâmico (#5).
//
// REGRA DE OURO: o preço que o cliente vê é o preço que ele paga. O fator é
// calculado uma vez, exibido na vitrine, e CONGELADO dentro de `itens` no
// momento em que o pedido é criado (ver app/api/cliente/criar-pedido). Nada
// recalcula preço depois que o cliente viu o carrinho — se a janela das 18h
// abrir enquanto ele escolhe, o pedido dele sai pelo preço antigo.
//
// Sem essa garantia isto vira aumento de preço no meio do checkout, que além
// de hostil é problema de CDC (art. 39, X — elevar preço sem justa causa).

/**
 * Janela de pico: sexta (5), sábado (6) e domingo (0), das 18h às 21h59.
 * Mesma janela usada pelo surge da taxa de entrega em lib/geo.ts, que importa
 * daqui — a definição mora num lugar só.
 */
export const JANELA_PICO = { dias: [0, 5, 6] as const, inicio: 18, fim: 22 }

/** +10% na janela de pico. */
export const FATOR_PICO = 0.10
/** +5% quando a loja está com muitos pedidos abertos ao mesmo tempo. */
export const FATOR_DEMANDA = 0.05
/** A partir de quantos pedidos abertos a loja conta como "alta demanda". */
export const LIMIAR_DEMANDA = 5

const FUSO = 'America/Sao_Paulo'

/**
 * Dia da semana (0=dom … 6=sáb) e hora no fuso de Brasília.
 *
 * O servidor roda em UTC na Vercel. Usar `getDay()`/`getHours()` direto daria
 * a janela errada por 3 horas — às 21h de sábado em Brasília já é domingo em
 * UTC, e o pico fecharia cedo demais.
 */
export function agoraEmBrasilia(agora: Date = new Date()): { diaSemana: number; hora: number } {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: FUSO, weekday: 'short', hour: 'numeric', hour12: false,
  })
  const partes = fmt.formatToParts(agora)
  const dia = partes.find(p => p.type === 'weekday')?.value ?? 'Sun'
  const hora = Number(partes.find(p => p.type === 'hour')?.value ?? '0')
  const dias = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  // `hour: numeric` com hour12:false devolve 24 à meia-noite em alguns runtimes.
  return { diaSemana: Math.max(0, dias.indexOf(dia)), hora: hora % 24 }
}

/** Sexta, sábado ou domingo, das 18h às 21h59 — no fuso de Brasília. */
export function emJanelaDePico(agora: Date = new Date()): boolean {
  const { diaSemana, hora } = agoraEmBrasilia(agora)
  return (JANELA_PICO.dias as readonly number[]).includes(diaSemana)
    && hora >= JANELA_PICO.inicio && hora < JANELA_PICO.fim
}

export type ContextoPreco = {
  /** `lojas.preco_dinamico`. */
  ativo: boolean
  /** Pedidos da loja com status 'recebido' ou 'preparando'. */
  pedidosAbertos: number
  agora?: Date
}

export type FatorPreco = {
  /** 1.00 = sem ajuste. */
  fator: number
  pico: boolean
  altaDemanda: boolean
}

/**
 * Multiplicador a aplicar sobre `preco_venda`. Os acréscimos são aditivos sobre
 * o preço base (pico + demanda = +15%), não compostos.
 */
export function calcularFator({ ativo, pedidosAbertos, agora = new Date() }: ContextoPreco): FatorPreco {
  if (!ativo) return { fator: 1, pico: false, altaDemanda: false }

  const pico = emJanelaDePico(agora)
  const altaDemanda = pedidosAbertos >= LIMIAR_DEMANDA

  const fator = 1 + (pico ? FATOR_PICO : 0) + (altaDemanda ? FATOR_DEMANDA : 0)
  return { fator: Math.round(fator * 100) / 100, pico, altaDemanda }
}

/** Preço com o fator aplicado, arredondado ao centavo. */
export function aplicarFator(precoBase: number, fator: number): number {
  return Math.round(precoBase * fator * 100) / 100
}

/** Texto do aviso ao cliente. Vazio quando não há ajuste. */
export function avisoPrecoDinamico(f: FatorPreco): string {
  if (f.fator <= 1) return ''
  const pct = Math.round((f.fator - 1) * 100)
  if (f.pico && f.altaDemanda) return `🔥 Preço dinâmico ativo · +${pct}% (horário de pico e alta demanda)`
  if (f.pico) return `🔥 Preço dinâmico ativo · +${pct}% (horário de pico)`
  return `🔥 Preço dinâmico ativo · +${pct}% (alta demanda agora)`
}
