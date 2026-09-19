// Horário de funcionamento da loja: `lojas.horario` é "HH:MM - HH:MM".
//
// A REGRA AQUI É A MESMA DE `loja_aberta()` NO BANCO (sql/2026-09-19-horario-
// bloqueia-pedido.sql). Mudou aqui, mude lá — senão o cliente deixa passar o
// que o trigger recusa (ou o contrário) e o erro vira "tente de novo" sem
// explicação. Igual à fórmula de XP: dois lugares, uma verdade.
//
//   * nulo ou não-parseável          -> ABERTA (fail-open)
//   * abre <  fecha (08:00 - 18:00)  -> abre <= agora < fecha
//   * abre >  fecha (18:00 - 02:00)  -> atravessa a meia-noite
//   * abre == fecha                  -> 24h
//
// Fuso: sempre America/Sao_Paulo, NÃO o relógio do celular do cliente — o
// banco decide nesse fuso, e um cliente em outro fuso veria a loja aberta
// e levaria a recusa do trigger.

export const FUSO_LOJA = 'America/Sao_Paulo'

// Mesma regex do SQL: aceita "08:00 - 18:00", "08:00-18:00" e "10:00--20:00".
const RE_HORARIO = /^(\d{1,2}:\d{2})\s*-+\s*(\d{1,2}:\d{2})$/

/** Minutos desde a meia-noite; null se o "HH:MM" não for uma hora válida. */
function minutos(hhmm: string): number | null {
  const [h, m] = hhmm.split(':').map(Number)
  if (!Number.isInteger(h) || !Number.isInteger(m) || h > 23 || m > 59) return null
  return h * 60 + m
}

/** { abre, fecha } em "HH:MM", ou null quando o texto não é um horário. */
export function parseHorario(horario: string | null | undefined): { abre: string; fecha: string } | null {
  const m = (horario ?? '').trim().match(RE_HORARIO)
  if (!m) return null
  if (minutos(m[1]) === null || minutos(m[2]) === null) return null
  return { abre: m[1], fecha: m[2] }
}

/** Minutos desde a meia-noite no fuso da loja. */
function agoraEmMinutos(em: Date): number {
  const partes = new Intl.DateTimeFormat('pt-BR', {
    timeZone: FUSO_LOJA, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(em)
  const h = Number(partes.find(p => p.type === 'hour')?.value)
  const m = Number(partes.find(p => p.type === 'minute')?.value)
  return h * 60 + m
}

/** A loja está aberta neste instante? (ver tabela-verdade no topo) */
export function lojaAberta(horario: string | null | undefined, em: Date = new Date()): boolean {
  const h = parseHorario(horario)
  if (!h) return true
  const abre = minutos(h.abre)!, fecha = minutos(h.fecha)!
  const agora = agoraEmMinutos(em)
  if (abre === fecha) return true
  if (abre < fecha) return agora >= abre && agora < fecha
  return agora >= abre || agora < fecha
}

/** Mensagem para o cliente quando a loja está fechada. */
export function msgLojaFechada(horario: string | null | undefined): string {
  const h = parseHorario(horario)
  return h
    ? `Esta loja está fechada agora. Abre às ${h.abre}.`
    : 'Esta loja está fechada agora.'
}
