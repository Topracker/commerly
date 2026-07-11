'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Trophy, Flame, Check, Circle, Sparkles, Gift, ArrowRight } from 'lucide-react'
import { MISSOES, medalhaPorSlug } from '../lib/crescimento'

type Perfil = {
  papel: string; nome: string; xp: number
  nivelXp: { nivel: number; pct: number; faltam: number }
  nivelPapel: { nome: string; emoji: string; cor: string; beneficios: string[]; proximoNome: string | null; pct: number; faltam: number; metricaLabel: string; metricaValor: number }
  medalhas: { slug: string; concedida_em: string }[]
  missoes: string[]
  streak: { dias: number; recorde: number }
  comunidade: { comerciantes: number; clientes: number; entregadores: number; pontosCidade: number }
  creditos: number; mesesGratis: number
}

export function PainelGamificacao({ papel }: { papel?: string }) {
  const [p, setP] = useState<Perfil | null>(null)

  useEffect(() => {
    let vivo = true
    async function carregar() {
      // Confirma uma indicação pendente (link /convite/[codigo]) uma única vez.
      try {
        const cod = localStorage.getItem('commerly:indicacao')
        if (cod) {
          await fetch('/api/indicacao/registrar', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ codigo: cod }),
          }).catch(() => {})
          localStorage.removeItem('commerly:indicacao')
        }
      } catch {}
      const d = await fetch('/api/gamificacao/sync').then(r => (r.ok ? r.json() : null)).catch(() => null)
      if (vivo && d && !d.error) setP(d)
      // Comerciante: sincroniza benefícios na Stripe (desconto por nível + meses
      // grátis de indicação). No-op se não houver assinatura ativa.
      if (d?.papel === 'comerciante') {
        fetch('/api/stripe/aplicar-desconto', { method: 'POST' }).catch(() => {})
      }
    }
    carregar()
    return () => { vivo = false }
  }, [])

  if (!p) return null

  const missoesPapel = MISSOES.filter(m => !m.papel || m.papel === p.papel)

  return (
    <div className="rounded-2xl border border-borda bg-card p-5">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-xl shrink-0" style={{ backgroundColor: `${p.nivelPapel.cor}22`, border: `1px solid ${p.nivelPapel.cor}55` }}>
            {p.nivelPapel.emoji}
          </div>
          <div className="min-w-0">
            <p className="text-xs text-gray-400">Nível {p.papel}</p>
            <p className="font-bold leading-tight" style={{ color: p.nivelPapel.cor }}>{p.nivelPapel.nome}</p>
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-white font-bold tabular-nums flex items-center gap-1 justify-end"><Sparkles size={15} className="text-acento" />{p.xp} XP</p>
          <p className="text-gray-500 text-xs">nível {p.nivelXp.nivel}</p>
        </div>
      </div>

      {/* Barra XP */}
      <div className="h-2 bg-elevado rounded-full overflow-hidden mb-1">
        <div className="h-full bg-acento rounded-full transition-all" style={{ width: `${p.nivelXp.pct}%` }} />
      </div>
      <p className="text-gray-500 text-xs mb-4">Faltam {p.nivelXp.faltam} XP para o próximo nível.</p>

      {/* Progresso de nível do papel */}
      {p.nivelPapel.proximoNome && (
        <div className="mb-4 rounded-xl border border-borda bg-superficie p-3">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-gray-400">Rumo a {p.nivelPapel.proximoNome}</span>
            <span className="text-gray-500 tabular-nums">{p.nivelPapel.metricaValor} {p.nivelPapel.metricaLabel} · faltam {p.nivelPapel.faltam}</span>
          </div>
          <div className="h-1.5 bg-elevado rounded-full overflow-hidden"><div className="h-full bg-acento rounded-full" style={{ width: `${p.nivelPapel.pct}%` }} /></div>
        </div>
      )}

      {/* Streak + créditos/meses */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="rounded-xl border border-borda bg-superficie p-2.5 text-center">
          <Flame size={16} className="text-orange-400 mx-auto mb-0.5" />
          <p className="text-white font-bold tabular-nums">{p.streak.dias}</p>
          <p className="text-gray-500 text-[10px]">dias seguidos</p>
        </div>
        <div className="rounded-xl border border-borda bg-superficie p-2.5 text-center">
          <Gift size={16} className="text-acento mx-auto mb-0.5" />
          <p className="text-white font-bold tabular-nums">{p.mesesGratis}</p>
          <p className="text-gray-500 text-[10px]">meses grátis</p>
        </div>
        <div className="rounded-xl border border-borda bg-superficie p-2.5 text-center">
          <p className="text-white font-bold tabular-nums mt-0.5">R${p.creditos.toFixed(0)}</p>
          <p className="text-gray-500 text-[10px]">em créditos</p>
        </div>
      </div>

      {/* Medalhas */}
      <div className="flex items-center justify-between mb-2">
        <p className="text-white text-sm font-semibold flex items-center gap-1.5"><Trophy size={15} className="text-acento" /> Medalhas ({p.medalhas.length})</p>
        <Link href="/medalhas" className="text-acento text-xs flex items-center gap-1">Ver todas <ArrowRight size={12} /></Link>
      </div>
      {p.medalhas.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {p.medalhas.map(m => {
            const md = medalhaPorSlug(m.slug)
            return (
              <Link key={m.slug} href={`/medalhas/${m.slug}`} title={md?.nome || m.slug} className="text-2xl hover:scale-110 transition" style={{ lineHeight: 1 }}>
                {md?.emoji || '🏅'}
              </Link>
            )
          })}
        </div>
      ) : <p className="text-gray-500 text-xs mb-4">Sua primeira medalha está logo ali. 🏅</p>}

      {/* Missões */}
      <p className="text-white text-sm font-semibold mb-2">Missões</p>
      <ul className="flex flex-col gap-1.5">
        {missoesPapel.map(m => {
          const feita = p.missoes.includes(m.slug)
          return (
            <li key={m.slug} className="flex items-center gap-2 text-sm">
              {feita ? <Check size={15} className="text-green-400 shrink-0" /> : <Circle size={15} className="text-gray-600 shrink-0" />}
              <span className={feita ? 'text-gray-400 line-through' : 'text-gray-300'}>{m.titulo}</span>
              <span className="ml-auto text-acento text-xs font-semibold shrink-0">+{m.xp} XP</span>
            </li>
          )
        })}
      </ul>

      {/* Comunidade */}
      {(p.comunidade.comerciantes + p.comunidade.clientes + p.comunidade.entregadores) > 0 && (
        <p className="text-gray-400 text-xs mt-4 pt-3 border-t border-borda">
          Você já ajudou <span className="text-white font-medium">{p.comunidade.comerciantes} comerciantes</span>,{' '}
          <span className="text-white font-medium">{p.comunidade.clientes} clientes</span> e{' '}
          <span className="text-white font-medium">{p.comunidade.entregadores} entregadores</span>.
          {p.comunidade.pontosCidade > 0 && <> Sua cidade ganhou <span className="text-acento font-medium">{p.comunidade.pontosCidade} pontos</span>. 💛</>}
        </p>
      )}
    </div>
  )
}

export default PainelGamificacao
