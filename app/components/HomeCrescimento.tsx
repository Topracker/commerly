'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Store, User, Bike, ShoppingBag, MapPin, Trophy, ArrowRight, Sparkles } from 'lucide-react'
import { MARCOS } from '../lib/crescimento'

type Contadores = { comerciantes: number; clientes: number; entregadores: number; pedidos: number; pedidos_hoje: number; cidades: number }
type FeedItem = { id: string; tipo: string; texto: string; cidade: string | null; created_at: string }
type Cidade = { nome: string; uf: string; slug: string; pontos: number; meta_pontos: number; status: string }

function useContador(alvo: number, dur = 1200) {
  const [v, setV] = useState(0)
  const raf = useRef<number | null>(null)
  useEffect(() => {
    const t0 = performance.now()
    const passo = (t: number) => {
      const p = Math.min(1, (t - t0) / dur)
      setV(Math.round((1 - Math.pow(1 - p, 3)) * alvo))
      if (p < 1) raf.current = requestAnimationFrame(passo)
    }
    raf.current = requestAnimationFrame(passo)
    return () => { if (raf.current) cancelAnimationFrame(raf.current) }
  }, [alvo, dur])
  return v
}

function Tile({ icone: Icone, valor, rotulo }: { icone: any; valor: number; rotulo: string }) {
  const n = useContador(valor)
  return (
    <div className="bg-card border border-borda rounded-2xl p-4 text-center">
      <Icone size={18} className="text-acento mx-auto mb-1.5" />
      <p className="font-display text-2xl sm:text-3xl font-bold text-white tabular-nums">{n.toLocaleString('pt-BR')}</p>
      <p className="text-gray-500 text-xs mt-0.5">{rotulo}</p>
    </div>
  )
}

export function HomeCrescimento() {
  const [c, setC] = useState<Contadores | null>(null)
  const [feed, setFeed] = useState<FeedItem[]>([])
  const [cidades, setCidades] = useState<Cidade[]>([])

  useEffect(() => {
    fetch('/api/publico/metricas')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d) { setC(d.contadores); setFeed(d.feed || []); setCidades(d.cidades || []) } })
      .catch(() => {})
  }, [])

  const cont = c || { comerciantes: 0, clientes: 0, entregadores: 0, pedidos: 0, pedidos_hoje: 0, cidades: 0 }

  return (
    <section className="relative z-10 px-6 pb-16">
      <div className="max-w-4xl mx-auto">
        <p className="text-center text-acento text-xs font-semibold uppercase tracking-wide mb-1">Ao vivo</p>
        <h2 className="anima-subir font-display text-center text-2xl font-bold text-white mb-1">
          A maior comunidade de pequenos comércios do Brasil
        </h2>
        <p className="text-center text-gray-500 text-sm mb-6">
          Comerciantes, clientes e entregadores em um único ecossistema.
        </p>

        {/* Contadores ao vivo */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <Tile icone={Store} valor={cont.comerciantes} rotulo="comerciantes" />
          <Tile icone={Bike} valor={cont.entregadores} rotulo="entregadores" />
          <Tile icone={User} valor={cont.clientes} rotulo="clientes" />
          <Tile icone={ShoppingBag} valor={cont.pedidos} rotulo="pedidos" />
          <Tile icone={Sparkles} valor={cont.pedidos_hoje} rotulo="pedidos hoje" />
          <Tile icone={MapPin} valor={cont.cidades} rotulo="cidades" />
        </div>

        {/* Feed de conquistas ao vivo */}
        {feed.length > 0 && (
          <div className="mt-4 bg-card border border-borda rounded-2xl p-4 overflow-hidden">
            <p className="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <Trophy size={13} className="text-acento" /> Conquistas da comunidade
            </p>
            <ul className="flex flex-col gap-1.5">
              {feed.slice(0, 6).map((f, i) => (
                <li
                  key={f.id}
                  className="anima-subir text-sm text-gray-300 flex items-center gap-2"
                  style={{ '--atraso': `${i * 60}ms` } as React.CSSProperties}
                >
                  <span className="truncate">{f.texto}</span>
                  {f.cidade && <span className="ml-auto shrink-0 text-[10px] text-gray-500 border border-borda rounded-full px-2 py-0.5">{f.cidade}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Marcos */}
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {MARCOS.map(m => {
            const atual = (cont as any)[m.metrica] || 0
            const pct = Math.min(100, Math.round((atual / m.valor) * 100))
            const batido = atual >= m.valor
            return (
              <div key={m.rotulo} className={`rounded-2xl border p-3 ${batido ? 'border-acento/50 bg-acento/10' : 'border-borda bg-card'}`}>
                <p className="text-xs text-gray-400">{m.rotulo}</p>
                <div className="h-1.5 bg-elevado rounded-full mt-2 overflow-hidden">
                  <div className="h-full bg-acento rounded-full transition-all" style={{ width: `${pct}%` }} />
                </div>
                <p className={`text-[11px] mt-1 ${batido ? 'text-acento font-semibold' : 'text-gray-500'}`}>
                  {batido ? '🎉 conquistado!' : `${pct}%`}
                </p>
              </div>
            )
          })}
        </div>

        {/* Ranking de cidades (prévia) */}
        {cidades.length > 0 && (
          <div className="mt-4 bg-card border border-borda rounded-2xl p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-gray-500 text-xs font-semibold uppercase tracking-wide flex items-center gap-1.5">
                <MapPin size={13} className="text-acento" /> Corrida das cidades
              </p>
              <Link href="/expansao" className="text-acento text-xs font-medium flex items-center gap-1 hover:brightness-110">
                Ver expansão <ArrowRight size={13} />
              </Link>
            </div>
            <ul className="flex flex-col gap-2">
              {cidades.slice(0, 3).map((cid, i) => {
                const pct = Math.min(100, Math.round((cid.pontos / cid.meta_pontos) * 100))
                return (
                  <li key={cid.slug}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="text-white font-medium">{['🥇', '🥈', '🥉'][i] || '•'} {cid.nome}/{cid.uf}</span>
                      <span className="text-gray-500 text-xs tabular-nums">{cid.pontos}/{cid.meta_pontos} pts</span>
                    </div>
                    <div className="h-1.5 bg-elevado rounded-full overflow-hidden">
                      <div className="h-full bg-acento rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </div>
    </section>
  )
}

export default HomeCrescimento
