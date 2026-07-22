'use client'
import { useEffect, useMemo, useState } from 'react'
import { Flame, Trophy, Target } from 'lucide-react'

// ============================================================================
// Streak visual — grade de contribuição estilo GitHub + chama animada.
// ----------------------------------------------------------------------------
// Substitui o contador numérico que existia no PainelGamificacao. Os dados vêm
// de `atividade_dias`, preenchida pelos gatilhos de gamificação no banco — ou
// seja, a grade reflete atividade REAL, não visitas à tela.
// ============================================================================

type Dia = { dia: string; eventos: number }
type Dados = { dias: Dia[]; streak: { dias: number; recorde: number; ultimo_dia: string | null } }

// Marcos do streak. 100 dias casa com a medalha secreta "centenário", que já
// existe em crescimento.ts — mudar aqui sem mudar lá deixaria a UI prometendo
// uma recompensa que o motor não concede.
const MARCOS = [3, 7, 14, 30, 60, 100, 365]

/** Nível de intensidade 0..4 a partir da contagem de eventos do dia. */
function nivel(eventos: number): number {
  if (eventos <= 0) return 0
  if (eventos === 1) return 1
  if (eventos <= 3) return 2
  if (eventos <= 6) return 3
  return 4
}

const CORES = [
  'bg-white/[0.04]',      // 0 — sem atividade
  'bg-emerald-900',
  'bg-emerald-700',
  'bg-emerald-500',
  'bg-emerald-300',
]

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

function iso(d: Date) { return d.toISOString().slice(0, 10) }

export function StreakGrid() {
  const [d, setD] = useState<Dados | null>(null)

  useEffect(() => {
    let vivo = true
    fetch('/api/gamificacao/atividade')
      .then(r => (r.ok ? r.json() : null))
      .then(j => { if (vivo && j && !j.error) setD(j) })
      .catch(() => {})
    return () => { vivo = false }
  }, [])

  // Semanas de domingo a sábado, terminando no sábado da semana atual — é o que
  // faz as colunas fecharem certinho como no GitHub.
  const semanas = useMemo(() => {
    const porDia = new Map((d?.dias || []).map(x => [x.dia, x.eventos]))
    const fim = new Date()
    fim.setHours(0, 0, 0, 0)
    fim.setDate(fim.getDate() + (6 - fim.getDay()))
    const inicio = new Date(fim)
    inicio.setDate(inicio.getDate() - (53 * 7 - 1))

    const cols: { data: Date; eventos: number; futuro: boolean }[][] = []
    const hoje = iso(new Date())
    for (let s = 0; s < 53; s++) {
      const col: { data: Date; eventos: number; futuro: boolean }[] = []
      for (let dia = 0; dia < 7; dia++) {
        const data = new Date(inicio)
        data.setDate(inicio.getDate() + s * 7 + dia)
        const chave = iso(data)
        col.push({ data, eventos: porDia.get(chave) || 0, futuro: chave > hoje })
      }
      cols.push(col)
    }
    return cols
  }, [d])

  const streak = d?.streak.dias || 0
  const recorde = d?.streak.recorde || 0
  // "Ativo" = houve atividade hoje ou ontem. Com dois dias parados a chama
  // apaga, que é justamente o aperto que faz o mecanismo funcionar.
  const ativo = useMemo(() => {
    const u = d?.streak.ultimo_dia
    if (!u) return false
    const ontem = new Date(); ontem.setDate(ontem.getDate() - 1)
    return u === iso(new Date()) || u === iso(ontem)
  }, [d])

  const proximo = MARCOS.find(m => m > streak) ?? null
  const faltam = proximo ? proximo - streak : 0

  return (
    <div className="bg-card border border-borda rounded-2xl p-4">
      <style>{`
        @keyframes chama { 0%,100% { transform: scale(1) rotate(-2deg); opacity: 1 }
                            50% { transform: scale(1.12) rotate(2deg); opacity: .85 } }
        .chama-viva { animation: chama 1.1s ease-in-out infinite; transform-origin: 50% 85%; }
        @media (prefers-reduced-motion: reduce) { .chama-viva { animation: none } }
      `}</style>

      {/* Cabeçalho: chama + streak + recorde + próxima recompensa */}
      <div className="flex items-center gap-4 flex-wrap mb-4">
        <div className="flex items-center gap-2.5">
          <Flame
            size={30}
            className={ativo ? 'text-orange-400 chama-viva' : 'text-gray-600'}
            fill={ativo ? 'currentColor' : 'none'}
          />
          <div>
            <p className="text-white font-bold text-2xl leading-none tabular-nums">{streak}</p>
            <p className="text-gray-500 text-xs mt-0.5">{streak === 1 ? 'dia seguido' : 'dias seguidos'}</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-sm">
          <Trophy size={15} className="text-yellow-500" />
          <span className="text-gray-400">Recorde</span>
          <span className="text-white font-semibold tabular-nums">{recorde}</span>
        </div>

        {proximo && (
          <div className="flex items-center gap-1.5 text-sm">
            <Target size={15} className="text-blue-400" />
            <span className="text-gray-400">Faltam</span>
            <span className="text-white font-semibold tabular-nums">{faltam}</span>
            <span className="text-gray-400">para {proximo} dias</span>
          </div>
        )}
      </div>

      {/* Grade. Rola na horizontal no celular — a página nunca rola junto. */}
      <div className="overflow-x-auto pb-1">
        <div className="inline-flex flex-col gap-1 min-w-max">
          <div className="flex gap-[3px] pl-[18px] h-3">
            {semanas.map((col, i) => {
              const primeiro = col[0].data
              const mostra = primeiro.getDate() <= 7
              return (
                <span key={i} className="w-[11px] text-[9px] text-gray-600 leading-none">
                  {mostra ? MESES[primeiro.getMonth()] : ''}
                </span>
              )
            })}
          </div>

          <div className="flex gap-[3px]">
            <div className="flex flex-col gap-[3px] pr-1 justify-around text-[9px] text-gray-600 w-[15px]">
              <span>seg</span><span>qua</span><span>sex</span>
            </div>
            {semanas.map((col, i) => (
              <div key={i} className="flex flex-col gap-[3px]">
                {col.map((c, j) => (
                  <span
                    key={j}
                    title={c.futuro ? '' : `${c.data.toLocaleDateString('pt-BR')} — ${c.eventos} ${c.eventos === 1 ? 'atividade' : 'atividades'}`}
                    className={`w-[11px] h-[11px] rounded-[2px] ${c.futuro ? 'bg-transparent' : CORES[nivel(c.eventos)]}`}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1.5 mt-3 text-[10px] text-gray-600">
        <span>menos</span>
        {CORES.map((c, i) => <span key={i} className={`w-[10px] h-[10px] rounded-[2px] ${c}`} />)}
        <span>mais</span>
      </div>
    </div>
  )
}
