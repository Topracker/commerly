// Datas e horas da Commerly — SEMPRE no fuso da loja (America/Sao_Paulo).
//
// Três armadilhas que este módulo resolve, e por que ninguém deve formatar
// data "na mão" fora daqui:
//
// 1) `timestamp without time zone`. vendas, gastos, fiado, lojas, produtos,
//    clientes e mais ~10 tabelas guardam `created_at` SEM fuso, preenchido por
//    `now()` num banco em UTC. O PostgREST devolve "2026-10-23T01:00:00" (sem
//    `Z`) e `new Date()` lê isso como hora LOCAL: a venda das 22h aparecia
//    como 01h do dia seguinte. `paraDate()` lê string sem fuso como UTC.
//
// 2) Servidor em UTC. Na Vercel, `toLocaleDateString('pt-BR')` sem `timeZone`
//    formata em UTC: depois das 21h o servidor já mostra o dia seguinte, e a
//    mesma avaliação tinha uma data em /loja/[id] (servidor) e outra em
//    /cliente/loja/[id] (navegador). Todo formatador daqui passa o fuso.
//
// 3) `toISOString().slice(0, 10)` é o dia em UTC, não o da loja. Para chave
//    de dia (YYYY-MM-DD) use `diaLoja()`; para "desde meia-noite" use
//    `inicioDiaLoja()`.
//
// O banco tem a regra espelhada: `(now() at time zone 'America/Sao_Paulo')::date`
// é o "hoje" da loja (registrar_atividade, streak). Mudou aqui, mude lá.
import { FUSO_LOJA } from './horario'

export { FUSO_LOJA }

type Entrada = string | number | Date

const RE_SO_DIA = /^\d{4}-\d{2}-\d{2}$/
// Termina em Z ou em ±HH, ±HHMM, ±HH:MM → já tem fuso.
const RE_COM_FUSO = /(Z|[+-]\d{2}(:?\d{2})?)$/i

/**
 * Converte o que vem do banco/código em `Date`.
 * - "YYYY-MM-DD" (coluna `date`): meio-dia UTC daquele dia — cai no mesmo
 *   dia em qualquer fuso do Brasil, então formatar não "volta um dia".
 * - data-hora sem fuso (`timestamp without time zone`): lida como UTC.
 * - com fuso / número / Date: como está.
 */
export function paraDate(v: Entrada): Date {
  if (v instanceof Date) return v
  if (typeof v === 'number') return new Date(v)
  const s = v.trim()
  if (RE_SO_DIA.test(s)) return new Date(`${s}T12:00:00Z`)
  if (!RE_COM_FUSO.test(s)) return new Date(`${s.replace(' ', 'T')}Z`)
  return new Date(s)
}

function partes(d: Date) {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSO_LOJA, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(d)
  const n = (t: string) => Number(p.find(x => x.type === t)?.value)
  return { ano: n('year'), mes: n('month'), dia: n('day'), hora: n('hour'), min: n('minute'), seg: n('second') }
}

const dois = (n: number) => String(n).padStart(2, '0')

/** Dia da loja em "YYYY-MM-DD" (padrão: agora). Substitui `toISOString().slice(0, 10)`. */
export function diaLoja(v: Entrada = new Date()): string {
  const { ano, mes, dia } = partes(paraDate(v))
  return `${ano}-${dois(mes)}-${dois(dia)}`
}

/** Hora (0–23) no fuso da loja. Substitui `getHours()` no servidor. */
export function horaLoja(v: Entrada = new Date()): number {
  return partes(paraDate(v)).hora
}

/** Dia da semana (0 = domingo) no fuso da loja. Substitui `getDay()`. */
export function diaSemanaLoja(v: Entrada = new Date()): number {
  const [a, m, d] = diaLoja(v).split('-').map(Number)
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay()
}

/** Soma `n` dias (pode ser negativo) a um "YYYY-MM-DD". */
export function somarDias(dia: string, n: number): string {
  const [a, m, d] = dia.split('-').map(Number)
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10)
}

/** Diferença do fuso da loja para UTC, em ms, no instante `d` (SP: −3h). */
function offsetLoja(d: Date): number {
  const p = partes(d)
  return Date.UTC(p.ano, p.mes - 1, p.dia, p.hora, p.min, p.seg) - Math.floor(d.getTime() / 1000) * 1000
}

/** Instante da meia-noite da loja no dia "YYYY-MM-DD" (padrão: hoje). Use em `.gte('created_at', …)`. */
export function inicioDiaLoja(dia: string = diaLoja()): Date {
  const [a, m, d] = dia.split('-').map(Number)
  const meiaNoiteUTC = Date.UTC(a, m - 1, d)
  return new Date(meiaNoiteUTC - offsetLoja(new Date(meiaNoiteUTC + 12 * 3600_000)))
}

/** Meia-noite do dia 1º do mês corrente da loja. */
export function inicioMesLoja(v: Entrada = new Date()): Date {
  return inicioDiaLoja(`${diaLoja(v).slice(0, 7)}-01`)
}

/**
 * Início dos filtros "Hoje / Semana / Mês" das telas da loja: meia-noite da
 * loja, últimos 7 dias corridos e dia 1º do mês. ('todos' não filtra — quem
 * chama nem aplica o `.gte`.)
 */
export function inicioPeriodo(periodo: string, agora: Date = new Date()): Date {
  if (periodo === 'hoje') return inicioDiaLoja(diaLoja(agora))
  if (periodo === 'semana') return new Date(agora.getTime() - 7 * 86400000)
  return inicioMesLoja(agora)
}

/** Data no fuso da loja. Padrão "dd/mm/aaaa"; `opcoes` troca o formato. */
export function formatarData(v: Entrada, opcoes?: Intl.DateTimeFormatOptions): string {
  return paraDate(v).toLocaleDateString('pt-BR', { ...(opcoes ?? {}), timeZone: FUSO_LOJA })
}

/** Hora "HH:MM" no fuso da loja. */
export function formatarHora(v: Entrada): string {
  return paraDate(v).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: FUSO_LOJA })
}

/** "dd/mm/aaaa HH:MM" no fuso da loja. */
export function formatarDataHora(v: Entrada): string {
  return `${formatarData(v)} ${formatarHora(v)}`
}
