'use client'
import { useEffect, useState } from 'react'
import { Gift, Copy, Check, MessageCircle } from 'lucide-react'

import { brl } from '../lib/precos'

const APP_BASE = 'https://commerly.vercel.app'

type Desconto = {
  confirmadas: number; pct: number; preco: number
  proxima: { pct: number; preco: number } | null
}

// Card de indicação reutilizável: mostra o código único do usuário logado, o
// link de convite, botão de copiar e compartilhar no WhatsApp, e quantas
// pessoas ele já trouxe. Busca (ou cria) o código em /api/indicacao/codigo.
export function CardIndicacao() {
  const [codigo, setCodigo] = useState<string | null>(null)
  const [usos, setUsos] = useState(0)
  const [copiado, setCopiado] = useState(false)
  const [desconto, setDesconto] = useState<Desconto | null>(null)

  useEffect(() => {
    fetch('/api/indicacao/codigo')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d?.codigo) { setCodigo(d.codigo); setUsos(d.usos || 0) } })
      .catch(() => {})
    // Só o comerciante tem mensalidade; para os outros papéis a rota devolve 0%
    // e o bloco de desconto simplesmente não aparece.
    fetch('/api/indicacao/desconto')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d && !d.error) setDesconto(d) })
      .catch(() => {})
  }, [])

  if (!codigo) return null
  const link = `${APP_BASE}/convite/${codigo}`
  const msg = `Vem pra Commerly comigo! Use meu convite: ${link}`

  function copiar() {
    navigator.clipboard?.writeText(link).then(() => {
      setCopiado(true); setTimeout(() => setCopiado(false), 1500)
    }).catch(() => {})
  }

  return (
    <div className="rounded-2xl border border-borda bg-card p-5">
      <div className="flex items-center gap-2 mb-1">
        <Gift size={18} className="text-acento" />
        <p className="text-white font-semibold">Indique e ganhe</p>
        {usos > 0 && <span className="ml-auto text-xs text-acento font-semibold">{usos} {usos === 1 ? 'pessoa' : 'pessoas'} trazida{usos === 1 ? '' : 's'} 💛</span>}
      </div>
      <p className="text-gray-400 text-sm mb-3">
        Cada indicação que assinar vale 10% de desconto na sua mensalidade — até 40%.
      </p>

      {desconto && (
        <div className="rounded-xl border border-borda bg-superficie px-4 py-3 mb-2">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-gray-500 text-xs">
              {desconto.confirmadas} indicação{desconto.confirmadas === 1 ? '' : 'ões'} confirmada{desconto.confirmadas === 1 ? '' : 's'}
            </p>
            <p className="text-white font-bold text-sm">
              {desconto.pct > 0 ? `${desconto.pct}% off · ` : ''}{brl(desconto.preco)}/mês
            </p>
          </div>
          {desconto.proxima && (
            <p className="text-acento text-xs mt-1">
              +1 assinando → {desconto.proxima.pct}% off ({brl(desconto.proxima.preco)}/mês)
            </p>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 bg-superficie border border-borda rounded-xl px-4 py-3 mb-2">
        <div className="min-w-0">
          <p className="text-gray-500 text-xs">Seu código</p>
          <p className="font-mono text-xl font-bold text-white tracking-widest">{codigo}</p>
        </div>
        <button onClick={copiar} className="shrink-0 flex items-center gap-1.5 bg-elevado border border-borda hover:bg-borda text-white text-sm font-medium px-3 py-2 rounded-xl transition">
          {copiado ? <Check size={15} className="text-green-400" /> : <Copy size={15} />}
          {copiado ? 'Copiado' : 'Copiar link'}
        </button>
      </div>

      <a
        href={`https://wa.me/?text=${encodeURIComponent(msg)}`}
        target="_blank" rel="noopener noreferrer"
        className="w-full flex items-center justify-center gap-1.5 bg-[#25D366] hover:brightness-105 text-white text-sm font-semibold px-3 py-2.5 rounded-xl transition"
      >
        <MessageCircle size={15} /> Compartilhar no WhatsApp
      </a>
    </div>
  )
}

export default CardIndicacao
