/**
 * Segunda-feira da semana de `d`, em UTC, no formato YYYY-MM-DD.
 * É a chave de cache semanal do Copilot (coluna `insights_semanais.semana`).
 */
export function segundaDaSemana(d: Date): string {
  const dt = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  // getUTCDay(): 0 = domingo. Recuamos até a segunda (domingo recua 6 dias).
  const diaSemana = dt.getUTCDay()
  const recuo = diaSemana === 0 ? 6 : diaSemana - 1
  dt.setUTCDate(dt.getUTCDate() - recuo)
  return dt.toISOString().slice(0, 10)
}
