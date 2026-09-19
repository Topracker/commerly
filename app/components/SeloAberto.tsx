'use client'
import { useEffect, useState } from 'react'
import { lojaAberta, parseHorario } from '../lib/horario'

// Selo "Aberta agora" / "Fechada — abre às HH:MM" ao lado do horário da loja.
// Client component de propósito: /loja/[id] e /cardapio/[id] são renderizados
// no servidor, e um selo calculado lá congelaria numa aba deixada aberta —
// aqui ele se reavalia a cada minuto. Sem horário parseável não renderiza
// nada (a regra é fail-open: a loja conta como aberta).
export function SeloAberto({ horario }: { horario: string | null | undefined }) {
  const [aberta, setAberta] = useState<boolean | null>(null)

  useEffect(() => {
    const avaliar = () => setAberta(lojaAberta(horario))
    avaliar()
    const t = setInterval(avaliar, 60_000)
    return () => clearInterval(t)
  }, [horario])

  const h = parseHorario(horario)
  if (!h || aberta === null) return null

  return aberta ? (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-green-500/15 px-2.5 py-0.5 text-xs font-semibold text-green-400">
      <span className="h-1.5 w-1.5 rounded-full bg-green-400" /> Aberta agora
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/15 px-2.5 py-0.5 text-xs font-semibold text-red-400">
      <span className="h-1.5 w-1.5 rounded-full bg-red-400" /> Fechada · abre às {h.abre}
    </span>
  )
}
