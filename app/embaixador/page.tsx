'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Copy, Check, MessageCircle, Award, Store, User, Bike, MapPin, FileText } from 'lucide-react'
import { NIVEIS_EMBAIXADOR, nivelDe } from '../lib/crescimento'
import { linkConvite } from '../lib/convite'

export default function EmbaixadorDashboard() {
  const [codigo, setCodigo] = useState<string | null>(null)
  const [usos, setUsos] = useState(0)
  const [perfil, setPerfil] = useState<any>(null)
  const [copiado, setCopiado] = useState(false)
  const [erro, setErro] = useState(false)

  useEffect(() => {
    Promise.all([
      fetch('/api/indicacao/codigo').then(r => (r.ok ? r.json() : null)).catch(() => null),
      fetch('/api/gamificacao/sync').then(r => (r.ok ? r.json() : null)).catch(() => null),
    ]).then(([c, p]) => {
      if (!c?.codigo) { setErro(true); return }
      setCodigo(c.codigo); setUsos(c.usos || 0)
      if (p && !p.error) setPerfil(p)
    })
  }, [])

  if (erro) return (
    <main data-theme="dark" className="min-h-screen bg-fundo flex items-center justify-center px-6 text-center">
      <div>
        <p className="text-white font-semibold mb-2">Entre para virar embaixador</p>
        <p className="text-gray-400 text-sm mb-4">Faça login em qualquer papel para gerar o seu código.</p>
        <Link href="/cliente/login" className="text-acento font-medium">Fazer login</Link>
      </div>
    </main>
  )
  if (!codigo) return <main data-theme="dark" className="min-h-screen bg-fundo flex items-center justify-center"><p className="text-gray-400">Carregando...</p></main>

  const com = perfil?.comunidade || { comerciantes: 0, clientes: 0, entregadores: 0, pontosCidade: 0 }
  const totalIndic = com.comerciantes + com.clientes + com.entregadores
  const nvl = nivelDe(NIVEIS_EMBAIXADOR, totalIndic)
  const link = linkConvite(codigo)
  const msg = `Vem pra Commerly comigo! Use o código ${codigo}: ${link}`

  function copiar() {
    navigator.clipboard?.writeText(link).then(() => { setCopiado(true); setTimeout(() => setCopiado(false), 1500) }).catch(() => {})
  }

  return (
    <main data-theme="dark" className="min-h-screen bg-fundo font-body">
      <header className="border-b border-borda bg-card/60 backdrop-blur sticky top-0 z-20">
        <div className="max-w-2xl mx-auto px-6 py-3 flex items-center gap-3">
          <Link href="/" className="text-gray-400 hover:text-white flex items-center gap-1.5 text-sm"><ArrowLeft size={16} /> Commerly</Link>
          <Link href="/embaixadores" className="ml-auto text-gray-400 hover:text-white text-sm">Sobre o programa</Link>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-6 py-10 space-y-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-white flex items-center gap-2"><Award size={26} className="text-acento" /> Embaixador</h1>
          <p className="text-gray-400 text-sm mt-1">Leve a Commerly para mais pessoas e suba de nível.</p>
        </div>

        {/* Nível */}
        <div className="bg-card border border-borda rounded-2xl p-5">
          <div className="flex items-center justify-between mb-2">
            <p className="font-bold text-lg" style={{ color: nvl.atual.cor }}>{nvl.atual.emoji} {nvl.atual.nome}</p>
            <p className="text-gray-500 text-sm tabular-nums">{totalIndic} indicações</p>
          </div>
          {nvl.proximo && (
            <>
              <div className="h-2 bg-elevado rounded-full overflow-hidden"><div className="h-full bg-acento rounded-full" style={{ width: `${nvl.pct}%` }} /></div>
              <p className="text-gray-500 text-xs mt-1">Faltam {nvl.faltam} para {nvl.proximo.nome}: {nvl.proximo.beneficios.join(', ')}.</p>
            </>
          )}
        </div>

        {/* Código */}
        <div className="bg-card border border-borda rounded-2xl p-5">
          <p className="text-gray-500 text-xs mb-1">Seu código exclusivo</p>
          <div className="flex items-center justify-between gap-3">
            <p className="font-mono text-2xl font-bold text-white tracking-widest">{codigo}</p>
            <div className="flex gap-2">
              <button onClick={copiar} className="flex items-center gap-1.5 bg-elevado border border-borda hover:bg-borda text-white text-sm px-3 py-2 rounded-xl">{copiado ? <Check size={15} className="text-green-400" /> : <Copy size={15} />}{copiado ? 'Copiado' : 'Link'}</button>
              <a href={`https://wa.me/?text=${encodeURIComponent(msg)}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 bg-[#25D366] text-white text-sm font-semibold px-3 py-2 rounded-xl"><MessageCircle size={15} /></a>
            </div>
          </div>
          <p className="text-gray-500 text-xs mt-2">{usos} cadastro(s) pelo seu código.</p>
        </div>

        {/* Convidados por tipo */}
        <div className="grid grid-cols-3 gap-3">
          {[{ Icone: Store, n: com.comerciantes, l: 'comerciantes' }, { Icone: User, n: com.clientes, l: 'clientes' }, { Icone: Bike, n: com.entregadores, l: 'entregadores' }].map(x => (
            <div key={x.l} className="bg-card border border-borda rounded-2xl p-4 text-center">
              <x.Icone size={16} className="text-acento mx-auto mb-1" />
              <p className="text-white font-bold text-xl tabular-nums">{x.n}</p>
              <p className="text-gray-500 text-xs">{x.l}</p>
            </div>
          ))}
        </div>

        <div className="bg-card border border-borda rounded-2xl p-4 flex items-center gap-2 text-sm text-gray-300">
          <MapPin size={16} className="text-acento shrink-0" /> Você já gerou <span className="text-white font-semibold">{com.pontosCidade} pontos</span> para a sua cidade.
        </div>

        <div className="flex flex-wrap gap-2">
          <Link href="/certificado/embaixador" className="flex items-center gap-1.5 bg-acento hover:bg-acento-forte text-white text-sm font-semibold px-4 py-2.5 rounded-xl"><FileText size={15} /> Gerar certificado</Link>
          <Link href="/hall-da-fama" className="flex items-center gap-1.5 bg-elevado border border-borda text-white text-sm font-medium px-4 py-2.5 rounded-xl">Ver ranking nacional</Link>
        </div>
      </div>
    </main>
  )
}
