'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '../supabase'
import { TOTAL_AULAS, aulaValida, AULAS } from '../lib/academy'
import { GraduationCap, ArrowRight } from 'lucide-react'

/**
 * Card do dashboard com o progresso na Commerly Academy.
 * Some quando o comerciante já concluiu tudo — a essa altura ele não precisa de
 * um card lembrando que terminou.
 */
export function AcademyCard({ lojaId }: { lojaId: string }) {
  const [concluidas, setConcluidas] = useState<number | null>(null)
  const router = useRouter()

  useEffect(() => {
    if (!lojaId) return
    let ativo = true
    createClient()
      .from('academy_progresso').select('aula_slug').eq('loja_id', lojaId)
      .then(({ data, error }) => {
        if (!ativo) return
        // Falha silenciosa: o card some, o dashboard não quebra.
        if (error) { setConcluidas(null); return }
        setConcluidas((data || []).filter((r: { aula_slug: string }) => aulaValida(r.aula_slug)).length)
      })
    return () => { ativo = false }
  }, [lojaId])

  if (concluidas === null || concluidas >= TOTAL_AULAS) return null

  const pct = Math.round((concluidas / TOTAL_AULAS) * 100)
  // Sugere a próxima aula não concluída seguindo a ordem de exibição. Como só
  // temos a contagem, usamos a primeira aula quando nada foi concluído.
  const proxima = concluidas === 0 ? AULAS[0] : null

  return (
    <button
      onClick={() => router.push('/academy')}
      className="w-full text-left bg-gradient-to-br from-blue-950/60 to-gray-900 border border-blue-900/60 rounded-2xl p-5 mb-6 hover:border-blue-700 transition group"
    >
      <div className="flex items-center gap-3 mb-3">
        <div className="w-9 h-9 rounded-xl bg-blue-500/20 flex items-center justify-center shrink-0">
          <GraduationCap size={17} className="text-blue-300" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white font-bold text-sm">Commerly Academy</p>
          <p className="text-gray-400 text-xs">
            {concluidas}/{TOTAL_AULAS} aulas concluídas
          </p>
        </div>
        <ArrowRight size={16} className="text-blue-400 shrink-0 group-hover:translate-x-0.5 transition-transform" />
      </div>

      <div className="w-full bg-gray-800 rounded-full h-2 overflow-hidden">
        <div className="h-2 rounded-full bg-blue-500 transition-all duration-700" style={{ width: `${pct}%` }} />
      </div>

      <p className="text-gray-400 text-xs mt-2.5">
        {proxima
          ? `Comece por "${proxima.titulo}".`
          : `${pct}% concluído — continue de onde parou.`}
      </p>
    </button>
  )
}
