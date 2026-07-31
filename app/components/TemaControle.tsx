'use client'
import { useEffect, useRef, useState } from 'react'
import { Sun, Moon, Palette, Check } from 'lucide-react'
import { useTema, ACENTOS, BRILHO_MIN, BRILHO_MAX, type Acento } from '../hooks/useTema'

/** Altura aproximada do painel — usada só para decidir se ele abre para cima. */
const ALTURA_PAINEL = 300

type Props = {
  /** Lado em que o painel se alinha ao botão. Numa sidebar estreita o painel
   *  não cabe alinhado à direita (ele sairia pela esquerda da tela). */
  alinhamento?: 'direita' | 'esquerda'
}

/**
 * Controle de aparência acessível no header de TODOS os layouts (comerciante,
 * cliente, entregador, fornecedor). Um botão que abre um painel com:
 *   - alternância claro/escuro
 *   - escolha da cor de destaque
 *   - ajuste de brilho
 * Tudo salvo no localStorage via useTema.
 *
 * O painel escolhe abrir para baixo ou para cima conforme o espaço livre: preso
 * a "para baixo" ele já ficou fora da viewport (e inclicável) quando o controle
 * morava no rodapé da sidebar do cliente.
 */
export function TemaControle({ alinhamento = 'direita' }: Props = {}) {
  const { tema, setTema, alternar, acento, setAcento, brilho, setBrilho } = useTema()
  const [aberto, setAberto] = useState(false)
  const [paraCima, setParaCima] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!aberto) return
    function fora(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false)
    }
    document.addEventListener('mousedown', fora)
    return () => document.removeEventListener('mousedown', fora)
  }, [aberto])

  function alternarPainel() {
    if (!aberto && ref.current) {
      const r = ref.current.getBoundingClientRect()
      const abaixo = window.innerHeight - r.bottom
      setParaCima(abaixo < ALTURA_PAINEL && r.top > abaixo)
    }
    setAberto(v => !v)
  }

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        onClick={alternarPainel}
        title="Aparência"
        aria-label="Aparência"
        aria-expanded={aberto}
        className="w-9 h-9 rounded-xl border border-gray-800 bg-gray-900 text-gray-400 hover:text-white hover:border-gray-700 transition flex items-center justify-center"
      >
        {tema === 'claro' ? <Moon size={16} /> : <Sun size={16} />}
      </button>

      {aberto && (
        <div
          className={`absolute w-64 z-50 rounded-2xl border border-borda bg-card p-4 shadow-xl anima-surgir ${
            alinhamento === 'esquerda' ? 'left-0' : 'right-0'
          } ${paraCima ? 'bottom-full mb-2' : 'top-full mt-2'}`}
        >
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-2 flex items-center gap-1.5">
            <Palette size={13} /> Aparência
          </p>

          {/* Claro / Escuro */}
          <div className="grid grid-cols-2 gap-2 mb-4">
            {([['claro', 'Claro', Sun], ['escuro', 'Escuro', Moon]] as const).map(([val, label, Icon]) => (
              <button
                key={val}
                onClick={() => setTema(val)}
                className={`flex items-center justify-center gap-1.5 py-2 rounded-xl text-sm font-medium border transition ${
                  tema === val ? 'bg-acento/15 border-acento/60 text-acento' : 'bg-superficie border-borda text-gray-300 hover:border-gray-700'
                }`}
              >
                <Icon size={14} /> {label}
              </button>
            ))}
          </div>

          {/* Cor de destaque */}
          <p className="text-xs text-gray-400 mb-2">Cor de destaque</p>
          <div className="flex items-center justify-between gap-1.5 mb-4">
            {(Object.keys(ACENTOS) as Acento[]).map(key => (
              <button
                key={key}
                onClick={() => setAcento(key)}
                title={ACENTOS[key].rotulo}
                aria-label={ACENTOS[key].rotulo}
                className={`w-9 h-9 rounded-full flex items-center justify-center transition ring-offset-2 ring-offset-card ${
                  acento === key ? 'ring-2 ring-white/70' : 'hover:scale-105'
                }`}
                style={{ backgroundColor: ACENTOS[key].amostra }}
              >
                {acento === key && <Check size={16} className="text-white drop-shadow" />}
              </button>
            ))}
          </div>

          {/* Brilho */}
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-xs text-gray-400">Brilho</p>
            <span className="text-xs text-gray-500 tabular-nums">{Math.round(brilho * 100)}%</span>
          </div>
          <input
            type="range"
            min={BRILHO_MIN}
            max={BRILHO_MAX}
            step={0.01}
            value={brilho}
            onChange={e => setBrilho(Number(e.target.value))}
            className="w-full accent-[var(--color-acento)]"
            aria-label="Ajustar brilho"
          />
          <button
            onClick={alternar}
            className="mt-3 w-full text-center text-xs text-gray-500 hover:text-gray-300 transition"
          >
            Alternar tema rapidamente
          </button>
        </div>
      )}
    </div>
  )
}

export default TemaControle
