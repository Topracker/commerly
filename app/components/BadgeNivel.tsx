'use client'
import { useEffect, useState } from 'react'
import { carregarPerfil } from '../lib/perfilGamificacao'

// Badge de nível + medalhas ao lado do nome. Compartilha uma única chamada ao
// /api/gamificacao/sync entre todas as instâncias (cache em lib/perfilGamificacao).

export function BadgeNivel({ compact = false }: { compact?: boolean }) {
  const [p, setP] = useState<any>(null)
  useEffect(() => { let v = true; carregarPerfil().then(d => { if (v && d && !d.error) setP(d) }); return () => { v = false } }, [])
  if (!p) return null
  const emojis = (p.medalhas || []).slice(0, 3).map((m: any) => m.slug)
  return (
    <span className="inline-flex items-center gap-1 align-middle">
      <span
        className="inline-flex items-center gap-1 text-[11px] font-bold px-1.5 py-0.5 rounded-full border"
        style={{ color: p.nivelPapel.cor, borderColor: `${p.nivelPapel.cor}66`, backgroundColor: `${p.nivelPapel.cor}18` }}
        title={`Nível ${p.nivelPapel.nome} · ${p.xp} XP`}
      >
        {p.nivelPapel.emoji} {p.nivelPapel.nome}
      </span>
      {!compact && p.medalhas?.length > 0 && (
        <span className="text-sm" title={`${p.medalhas.length} medalha(s)`}>
          {(p.medalhas as any[]).slice(0, 3).map((m, i) => <span key={i}>{medEmoji(m.slug)}</span>)}
        </span>
      )}
    </span>
  )
}

function medEmoji(slug: string): string {
  const map: Record<string, string> = {
    fundador: '🏅', pioneiro: '🚀', embaixador: '🎖️', 'cidade-campea': '🏆',
    'primeira-compra': '🛍️', 'primeira-entrega': '📦', 'fa-da-commerly': '💛',
    maratonista: '🏃', velocista: '⚡', estrela: '⭐', 'top-vendedor': '👑',
    'rei-da-cidade': '👑', 'entregador-do-mes': '🥇', 'cliente-vip': '💎',
    'super-embaixador': '🎖️', coruja: '🦉', centenario: '🔥',
  }
  return map[slug] || '🏅'
}

export default BadgeNivel
