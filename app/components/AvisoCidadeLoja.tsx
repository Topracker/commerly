'use client'
import { useEffect, useState } from 'react'
import { MapPin, AlertTriangle, ChevronRight } from 'lucide-react'

// Aviso no dashboard do comerciante sobre a cidade da loja.
//
// O problema que ele resolve: com `lojas.cidade_slug` nulo, o gating de
// `delivery` cai só no escopo `__global__` (hoje OFF) e a loja simplesmente
// não recebe pedidos — o checkout barra e ninguém avisava o comerciante. Ele
// via uma loja "no ar" que nunca vendia.
//
// São dois avisos bem diferentes, e o tom acompanha:
//   sem_cidade   → algo está errado com o cadastro DELE e tem conserto (âmbar,
//                  com botão para /configuracoes).
//   sem_delivery → a cidade existe, só não abrimos ainda; não é culpa nem erro
//                  dele, então é informativo (sem alarme, sem botão).
//
// Persistente de propósito: nada de "dispensar". Enquanto a loja não recebe
// pedidos, o aviso continua ali.

type Estado = 'sem_cidade' | 'sem_delivery' | 'liberada'
type Situacao = { estado: Estado; slug: string | null; cidade: string | null; uf: string | null }

export function AvisoCidadeLoja({ className = '' }: { className?: string }) {
  const [sit, setSit] = useState<Situacao | null>(null)

  useEffect(() => {
    let vivo = true
    fetch('/api/loja/cidade')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (vivo && d?.estado) setSit(d) })
      .catch(() => { /* silencioso: o aviso não pode derrubar o dashboard */ })
    return () => { vivo = false }
  }, [])

  if (!sit || sit.estado === 'liberada') return null

  if (sit.estado === 'sem_cidade') {
    return (
      <div className={`bg-amber-950 border border-amber-800 rounded-2xl p-4 flex items-start gap-3 ${className}`}>
        <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center shrink-0">
          <AlertTriangle size={20} className="text-amber-300" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-amber-200 font-semibold text-sm mb-1">Sua loja ainda não recebe pedidos</p>
          <p className="text-amber-100/90 text-sm leading-relaxed">
            Não conseguimos identificar a cidade da sua loja — por isso ela ainda não recebe pedidos.
            Confirme seu endereço em Configurações.
          </p>
          <button
            onClick={() => (window.location.href = '/configuracoes')}
            className="mt-3 bg-amber-500 hover:bg-amber-400 text-amber-950 text-sm font-semibold px-4 py-2 rounded-xl transition inline-flex items-center gap-1.5"
          >
            Confirmar endereço
            <ChevronRight size={15} />
          </button>
        </div>
      </div>
    )
  }

  const cidade = sit.uf ? `${sit.cidade}/${sit.uf}` : sit.cidade
  return (
    <div className={`bg-card border border-borda rounded-2xl p-4 flex items-start gap-3 ${className}`}>
      <div className="w-10 h-10 rounded-xl bg-acento/15 flex items-center justify-center shrink-0">
        <MapPin size={20} className="text-acento" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-white font-semibold text-sm mb-1">Delivery ainda não abriu na sua cidade</p>
        <p className="text-gray-300 text-sm leading-relaxed">
          Sua loja está em <strong className="text-white">{cidade}</strong>. O delivery ainda não abriu aí,
          mas você já pode usar todo o resto do sistema.
        </p>
      </div>
    </div>
  )
}
