'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, MapPin, Trophy, Loader2 } from 'lucide-react'
import { LEGENDA_PONTOS } from '../lib/crescimento'
import FormularioInteresseCidade from '../components/FormularioInteresseCidade'

type Cidade = { nome: string; uf: string; slug: string; pontos: number; meta_pontos: number; status: string }

export default function Expansao() {
  const [cidades, setCidades] = useState<Cidade[]>([])
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    fetch('/api/publico/metricas')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d) setCidades(d.cidades || []) })
      .catch(() => {})
      .finally(() => setCarregando(false))
  }, [])

  return (
    <main data-theme="dark" className="min-h-screen bg-fundo font-body">
      <header className="border-b border-borda bg-card/60 backdrop-blur sticky top-0 z-20">
        <div className="max-w-4xl mx-auto px-6 py-3 flex items-center gap-3">
          <Link href="/" className="text-gray-400 hover:text-white flex items-center gap-1.5 text-sm"><ArrowLeft size={16} /> Commerly</Link>
          <div className="ml-auto flex items-center gap-4 text-sm">
            <Link href="/expansao/dashboard" className="text-gray-400 hover:text-white">Dashboard</Link>
            <Link href="/fundadores" className="text-gray-400 hover:text-white">Fundadores</Link>
          </div>
        </div>
      </header>

      <section className="px-6 pt-14 pb-8 text-center">
        <div className="max-w-3xl mx-auto">
          <p className="text-acento text-xs font-semibold uppercase tracking-wide mb-2">Expansão por cidades</p>
          <h1 className="font-display text-4xl sm:text-5xl font-bold text-white tracking-tight">A corrida das cidades</h1>
          <p className="text-gray-400 text-lg mt-4 leading-relaxed">
            A Commerly chega primeiro nas cidades que mais somam pontos. Traga a sua comunidade e faça a sua cidade ser escolhida.
          </p>
        </div>
      </section>

      <div className="max-w-4xl mx-auto px-6 pb-24">
        {/* Ranking */}
        <div className="bg-card border border-borda rounded-2xl p-5 mb-6">
          <p className="text-white font-semibold mb-4 flex items-center gap-2"><Trophy size={18} className="text-acento" /> Ranking ao vivo</p>
          {carregando ? (
            <p className="text-gray-500 text-sm flex items-center gap-2"><Loader2 size={15} className="animate-spin" /> Carregando...</p>
          ) : cidades.length === 0 ? (
            <p className="text-gray-500 text-sm">Ainda não há cidades no ranking.</p>
          ) : (
            <ol className="flex flex-col gap-3">
              {cidades.map((c, i) => {
                const pct = Math.min(100, Math.round((c.pontos / c.meta_pontos) * 100))
                const batido = c.pontos >= c.meta_pontos
                return (
                  <li key={c.slug}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <Link href={`/expansao/${c.slug}`} className="text-white font-medium hover:text-acento">
                        {['🥇', '🥈', '🥉'][i] || `${i + 1}º`} {c.nome}/{c.uf}
                      </Link>
                      <span className="text-gray-500 text-xs tabular-nums">{c.pontos}/{c.meta_pontos} pts · {pct}%</span>
                    </div>
                    <div className="h-2 bg-elevado rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${batido ? 'bg-yellow-400' : 'bg-acento'}`} style={{ width: `${pct}%` }} />
                    </div>
                    {batido && <p className="text-yellow-300 text-xs mt-1">🎉 {c.nome} bateu a meta!</p>}
                  </li>
                )
              })}
            </ol>
          )}
        </div>

        <div className="grid sm:grid-cols-2 gap-6">
          {/* Como pontuar */}
          <div className="bg-card border border-borda rounded-2xl p-5">
            <p className="text-white font-semibold mb-3">Como a sua cidade pontua</p>
            <ul className="flex flex-col gap-2">
              {LEGENDA_PONTOS.map(l => (
                <li key={l.acao} className="flex items-center justify-between text-sm">
                  <span className="text-gray-300">{l.rotulo}</span>
                  <span className="text-acento font-semibold tabular-nums">+{l.pontos}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Formulário */}
          <div className="bg-card border border-borda rounded-2xl p-5">
            <p className="text-white font-semibold mb-1 flex items-center gap-2"><MapPin size={18} className="text-acento" /> Quero a Commerly na minha cidade</p>
            <p className="text-gray-500 text-sm mb-3">Deixe seu e-mail e a gente te avisa quando chegar.</p>
            <FormularioInteresseCidade />
          </div>
        </div>

        <p className="text-center text-gray-600 text-xs mt-8">
          Cronograma público: as cidades no topo do ranking entram primeiro. Acompanhe o <Link href="/expansao/dashboard" className="text-acento">dashboard de expansão</Link>.
        </p>
      </div>
    </main>
  )
}
