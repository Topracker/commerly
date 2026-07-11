'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Trophy, Loader2 } from 'lucide-react'

const PAPEIS = [
  { v: 'comerciantes', l: 'Comerciantes' }, { v: 'entregadores', l: 'Entregadores' },
  { v: 'clientes', l: 'Clientes' }, { v: 'embaixadores', l: 'Embaixadores' }, { v: 'cidades', l: 'Cidades' },
]
const PERIODOS = [
  { v: 'hoje', l: 'Hoje' }, { v: 'semana', l: 'Semana' }, { v: 'mes', l: 'Mês' }, { v: 'ano', l: 'Ano' }, { v: 'geral', l: 'Geral' },
]
const medalha = (i: number) => (i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`)

export default function Ranking() {
  const [papel, setPapel] = useState('comerciantes')
  const [periodo, setPeriodo] = useState('geral')
  const [cidade, setCidade] = useState('')
  const [itens, setItens] = useState<any[] | null>(null)

  useEffect(() => {
    setItens(null)
    const p = new URLSearchParams({ papel, periodo })
    if (cidade.trim() && papel !== 'cidades') { p.set('escopo', 'cidade'); p.set('cidade', cidade.trim()) }
    const t = setTimeout(() => {
      fetch(`/api/ranking?${p}`).then(r => (r.ok ? r.json() : null)).then(d => setItens(d?.itens || [])).catch(() => setItens([]))
    }, cidade ? 350 : 0)
    return () => clearTimeout(t)
  }, [papel, periodo, cidade])

  return (
    <main data-theme="dark" className="min-h-screen bg-fundo font-body">
      <header className="border-b border-borda bg-card/60 backdrop-blur sticky top-0 z-20">
        <div className="max-w-2xl mx-auto px-6 py-3 flex items-center gap-3">
          <Link href="/" className="text-gray-400 hover:text-white flex items-center gap-1.5 text-sm"><ArrowLeft size={16} /> Commerly</Link>
          <Link href="/hall-da-fama" className="ml-auto text-gray-400 hover:text-white text-sm">Hall da Fama</Link>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-6 py-8">
        <h1 className="font-display text-3xl font-bold text-white flex items-center gap-2 mb-1"><Trophy size={26} className="text-acento" /> Rankings</h1>
        <p className="text-gray-400 text-sm mb-5">Quem move o comércio local na Commerly.</p>

        {/* Papel */}
        <div className="flex gap-1 overflow-x-auto mb-3">
          {PAPEIS.map(p => (
            <button key={p.v} onClick={() => setPapel(p.v)} className={`px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition ${papel === p.v ? 'bg-acento text-white' : 'bg-card border border-borda text-gray-400 hover:text-white'}`}>{p.l}</button>
          ))}
        </div>
        {/* Período */}
        <div className="flex gap-1 overflow-x-auto mb-3">
          {PERIODOS.map(p => (
            <button key={p.v} onClick={() => setPeriodo(p.v)} className={`px-3 py-1 rounded-full text-xs whitespace-nowrap transition ${periodo === p.v ? 'bg-elevado text-white border border-acento/50' : 'text-gray-500 hover:text-white'}`}>{p.l}</button>
          ))}
        </div>
        {/* Cidade (não se aplica ao ranking de cidades) */}
        {papel !== 'cidades' && (
          <input value={cidade} onChange={e => setCidade(e.target.value)} placeholder="Filtrar por cidade (ex.: Goiânia)" className="w-full bg-card border border-borda rounded-xl px-3 py-2 text-sm text-white placeholder-gray-600 mb-5 focus:outline-none focus:border-acento/50" />
        )}

        {/* Lista */}
        {itens === null ? (
          <div className="flex justify-center py-12"><Loader2 className="animate-spin text-acento" /></div>
        ) : itens.length === 0 ? (
          <p className="text-gray-500 text-sm text-center py-12">Sem dados para este filtro ainda.</p>
        ) : (
          <ol className="space-y-2">
            {itens.map((it, i) => {
              const conteudo = (
                <div className={`flex items-center gap-3 rounded-xl border p-3 ${i < 3 ? 'border-acento/40 bg-acento/5' : 'border-borda bg-card'}`}>
                  <span className="w-7 text-center text-lg font-bold tabular-nums shrink-0">{medalha(i)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-white text-sm font-medium truncate">{it.nome}</p>
                    {it.extra && <p className="text-gray-500 text-xs truncate">{it.extra}</p>}
                  </div>
                  <span className="text-acento font-bold tabular-nums text-sm shrink-0">{it.valor} <span className="text-gray-500 font-normal text-xs">{it.unidade}</span></span>
                </div>
              )
              return <li key={i}>{it.href ? <Link href={it.href}>{conteudo}</Link> : conteudo}</li>
            })}
          </ol>
        )}
      </div>
    </main>
  )
}
