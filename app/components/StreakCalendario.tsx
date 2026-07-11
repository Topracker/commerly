import { Flame } from 'lucide-react'

// Calendário estilo GitHub/Duolingo do mês corrente. Sem histórico dia-a-dia no
// banco: reconstrói a sequência atual (os últimos `dias` dias até `ultimo_dia`).
export function StreakCalendario({
  dias, recorde, ultimo_dia, proximaRecompensa,
}: { dias: number; recorde: number; ultimo_dia: string | null; proximaRecompensa?: string }) {
  const hoje = new Date()
  const ano = hoje.getFullYear()
  const mes = hoje.getMonth()
  const primeiroDiaSemana = new Date(ano, mes, 1).getDay()
  const diasNoMes = new Date(ano, mes + 1, 0).getDate()

  // Conjunto de dias ativos (a sequência atual que cai dentro deste mês).
  const ativos = new Set<number>()
  if (ultimo_dia && dias > 0) {
    const fim = new Date(ultimo_dia + 'T00:00:00')
    for (let i = 0; i < dias; i++) {
      const d = new Date(fim.getTime() - i * 86400000)
      if (d.getFullYear() === ano && d.getMonth() === mes) ativos.add(d.getDate())
    }
  }

  const proxMarco = dias < 7 ? 7 : dias < 30 ? 30 : dias < 100 ? 100 : dias + 1
  const meses = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

  return (
    <div className="rounded-2xl border border-borda bg-card p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-white text-sm font-semibold flex items-center gap-1.5">
          <Flame size={16} className="text-orange-400" /> Sequência
        </p>
        <div className="text-right">
          <p className="text-white font-bold tabular-nums leading-none">{dias} <span className="text-gray-500 font-normal text-xs">dias</span></p>
          <p className="text-gray-500 text-[11px]">recorde: {recorde}</p>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center">
        {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d, i) => (
          <span key={i} className="text-[10px] text-gray-600">{d}</span>
        ))}
        {Array.from({ length: primeiroDiaSemana }).map((_, i) => <span key={`e${i}`} />)}
        {Array.from({ length: diasNoMes }).map((_, i) => {
          const dia = i + 1
          const ativo = ativos.has(dia)
          const ehHoje = dia === hoje.getDate()
          return (
            <span
              key={dia}
              className={`aspect-square rounded-md text-[10px] flex items-center justify-center tabular-nums ${
                ativo ? 'bg-orange-500/80 text-white font-semibold' : 'bg-elevado text-gray-600'
              } ${ehHoje ? 'ring-1 ring-acento' : ''}`}
              title={ativo ? 'Ativo' : ''}
            >
              {dia}
            </span>
          )
        })}
      </div>

      <p className="text-gray-500 text-xs mt-3 pt-3 border-t border-borda">
        {meses[mes]}/{ano} · {proximaRecompensa
          ? <>Próxima recompensa: <span className="text-acento">{proximaRecompensa}</span></>
          : <>Faltam <span className="text-white font-medium">{Math.max(0, proxMarco - dias)}</span> dias para {proxMarco} seguidos 🔥</>}
      </p>
    </div>
  )
}

export default StreakCalendario
