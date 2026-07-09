'use client'
import { useEffect, useState } from 'react'
import { Sparkles, ChevronRight, RefreshCw } from 'lucide-react'

type Insight = { titulo: string; texto: string; acao: string; rota: string }

/**
 * Card do IA Copilot: 3 insights da semana gerados pelo Gemini.
 * A rota cacheia por (loja, semana), então abrir o dashboard várias vezes
 * não gera novas chamadas ao modelo.
 */
export function CopilotCard() {
  const [insights, setInsights] = useState<Insight[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')

  useEffect(() => { buscar() }, [])

  async function buscar() {
    setCarregando(true)
    setErro('')
    try {
      const res = await fetch('/api/copilot/insights')
      const data = await res.json()
      if (!res.ok) setErro(data.erro || 'Não foi possível carregar os insights.')
      else setInsights(data.insights || [])
    } catch {
      setErro('Não foi possível carregar os insights.')
    }
    setCarregando(false)
  }

  return (
    <div className="bg-gradient-to-br from-purple-950/60 to-gray-900 border border-purple-900/60 rounded-2xl p-5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-purple-500/20 flex items-center justify-center">
            <Sparkles size={16} className="text-purple-300" />
          </div>
          <div>
            <p className="text-white font-semibold text-sm">Copilot da semana</p>
            <p className="text-gray-500 text-xs">3 insights gerados por IA</p>
          </div>
        </div>
        {erro && (
          <button onClick={buscar} className="text-gray-500 hover:text-white transition" title="Tentar de novo">
            <RefreshCw size={15} />
          </button>
        )}
      </div>

      {carregando ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map(i => <div key={i} className="h-14 bg-gray-800/60 rounded-xl animate-pulse" />)}
        </div>
      ) : erro ? (
        <p className="text-gray-500 text-xs">{erro}</p>
      ) : insights.length === 0 ? (
        <p className="text-gray-500 text-xs">Registre algumas vendas para o Copilot ter o que analisar.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {insights.map((ins, i) => (
            <button
              key={i}
              onClick={() => { window.location.href = ins.rota }}
              className="w-full text-left bg-gray-950/50 hover:bg-gray-950 border border-gray-800 rounded-xl p-3 transition group"
            >
              <div className="flex items-start gap-2">
                <span className="text-purple-400 font-bold text-xs mt-0.5 shrink-0">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-semibold">{ins.titulo}</p>
                  <p className="text-gray-400 text-xs leading-relaxed mt-0.5">{ins.texto}</p>
                  {ins.acao && (
                    <span className="inline-flex items-center gap-1 text-purple-300 text-xs font-semibold mt-1.5 group-hover:text-purple-200">
                      {ins.acao} <ChevronRight size={12} />
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
