'use client'
import { useEffect, useState } from 'react'
import { ChevronDown, Sparkles } from 'lucide-react'
import { carregarPerfil } from '../lib/perfilGamificacao'

const ABERTO_KEY = 'commerly:dash:progresso'

/**
 * "Seu progresso" — gamificação (nível, XP, streak, medalhas, missões) e
 * indicação juntos, no fim do dashboard e RECOLHIDO por padrão.
 *
 * Por que existe: quem abre o painel quer saber como o negócio está hoje —
 * faturamento, pedidos, lucro. O progresso é recompensa, não diagnóstico, então
 * desceu para o rodapé e virou uma linha ("Bronze · 26 XP · 3 dias seguidos")
 * que só se abre a pedido.
 *
 * IMPORTANTE: os filhos ficam SEMPRE montados e são escondidos por CSS quando
 * recolhido — nunca desmontados. O <PainelGamificacao/> dispara o POST em
 * /api/stripe/aplicar-desconto (sincroniza o desconto da mensalidade por nível
 * e indicações) dentro do próprio useEffect; desmontá-lo faria o comerciante
 * parar de receber o desconto só porque o bloco estava fechado.
 */
export function BlocoProgresso({ children }: { children: React.ReactNode }) {
  const [aberto, setAberto] = useState(false)
  const [p, setP] = useState<any>(null)

  // Preferência do comerciante: se ele abriu o bloco, continua aberto.
  // Fechado é o padrão — inclusive na primeira visita.
  useEffect(() => {
    try { setAberto(localStorage.getItem(ABERTO_KEY) === '1') } catch { /* sem storage: fechado */ }
  }, [])

  useEffect(() => {
    let vivo = true
    carregarPerfil().then(d => { if (vivo && d && !d.error) setP(d) })
    return () => { vivo = false }
  }, [])

  function alternar() {
    setAberto(a => {
      const novo = !a
      try { localStorage.setItem(ABERTO_KEY, novo ? '1' : '0') } catch { /* segue sem persistir */ }
      return novo
    })
  }

  // Resumo de uma linha: "Bronze · 26 XP · 3 dias seguidos".
  const partes: string[] = []
  if (p?.nivelPapel?.nome) partes.push(p.nivelPapel.nome)
  if (typeof p?.xp === 'number') partes.push(`${p.xp} XP`)
  if (p?.streak?.dias > 0) partes.push(`${p.streak.dias} ${p.streak.dias === 1 ? 'dia seguido' : 'dias seguidos'}`)
  const resumo = partes.length ? partes.join(' · ') : 'Nível, XP, medalhas, missões e indicação'

  return (
    <div className="rounded-2xl border border-borda bg-card overflow-hidden mb-6">
      <button
        onClick={alternar}
        aria-expanded={aberto}
        aria-controls="bloco-progresso-conteudo"
        className="w-full flex items-center gap-3 p-4 text-left transition hover:bg-elevado/40"
      >
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0"
          style={p?.nivelPapel?.cor
            ? { backgroundColor: `${p.nivelPapel.cor}22`, border: `1px solid ${p.nivelPapel.cor}55` }
            : undefined}
        >
          {p?.nivelPapel?.emoji || <Sparkles size={17} className="text-acento" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white font-semibold text-sm">Seu progresso</p>
          <p className="text-gray-400 text-xs truncate">{resumo}</p>
        </div>
        <ChevronDown
          size={18}
          className={`text-gray-500 shrink-0 transition-transform duration-200 ${aberto ? 'rotate-180' : ''}`}
        />
      </button>

      {/* `hidden` (display:none) em vez de desmontar: ver o comentário do topo. */}
      <div id="bloco-progresso-conteudo" className={aberto ? 'px-4 pb-4' : 'hidden'}>
        <div className="flex flex-col gap-4">{children}</div>
      </div>
    </div>
  )
}

export default BlocoProgresso
