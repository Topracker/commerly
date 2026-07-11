'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, MapPin, Trophy, Check, Loader2 } from 'lucide-react'
import { LEGENDA_PONTOS } from '../lib/crescimento'

type Cidade = { nome: string; uf: string; slug: string; pontos: number; meta_pontos: number; status: string }

export default function Expansao() {
  const [cidades, setCidades] = useState<Cidade[]>([])
  const [carregando, setCarregando] = useState(true)

  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [cidade, setCidade] = useState('')
  const [uf, setUf] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [ok, setOk] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/publico/metricas')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d) setCidades(d.cidades || []) })
      .catch(() => {})
      .finally(() => setCarregando(false))
  }, [])

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setErro(null); setOk(null)
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { setErro('Informe um e-mail válido.'); return }
    if (cidade.trim().length < 2) { setErro('Informe a sua cidade.'); return }
    setEnviando(true)
    try {
      const res = await fetch('/api/expansao/interesse', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome, email, cidade_nome: cidade, uf }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setErro(d.error || 'Não foi possível registrar.'); setEnviando(false); return }
      setOk(`Prontinho! Você é a pessoa nº ${d.posicao} querendo a Commerly em ${cidade}. Vamos te avisar. 💛`)
      setNome(''); setEmail(''); setCidade(''); setUf('')
    } catch { setErro('Erro de rede. Tente de novo.') } finally { setEnviando(false) }
  }

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
            {ok ? (
              <div className="bg-acento/10 border border-acento/40 rounded-xl p-4 text-sm text-acento flex items-start gap-2">
                <Check size={16} className="shrink-0 mt-0.5" /> {ok}
              </div>
            ) : (
              <form onSubmit={enviar} className="flex flex-col gap-2.5">
                <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Seu nome (opcional)" className="bg-superficie border border-borda text-white rounded-xl px-3 py-2.5 outline-none focus:border-acento/60 text-sm" />
                <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="Seu e-mail *" className="bg-superficie border border-borda text-white rounded-xl px-3 py-2.5 outline-none focus:border-acento/60 text-sm" />
                <div className="flex gap-2">
                  <input value={cidade} onChange={e => setCidade(e.target.value)} placeholder="Sua cidade *" className="flex-1 bg-superficie border border-borda text-white rounded-xl px-3 py-2.5 outline-none focus:border-acento/60 text-sm" />
                  <input value={uf} onChange={e => setUf(e.target.value.toUpperCase().slice(0, 2))} placeholder="UF" maxLength={2} className="w-16 bg-superficie border border-borda text-white rounded-xl px-3 py-2.5 outline-none focus:border-acento/60 text-sm uppercase" />
                </div>
                {erro && <p className="text-red-400 text-xs">{erro}</p>}
                <button type="submit" disabled={enviando} className="bg-acento hover:bg-acento-forte disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl transition flex items-center justify-center gap-2">
                  {enviando ? <Loader2 size={16} className="animate-spin" /> : <MapPin size={16} />} Quero trazer a Commerly
                </button>
              </form>
            )}
          </div>
        </div>

        <p className="text-center text-gray-600 text-xs mt-8">
          Cronograma público: as cidades no topo do ranking entram primeiro. Acompanhe o <Link href="/expansao/dashboard" className="text-acento">dashboard de expansão</Link>.
        </p>
      </div>
    </main>
  )
}
