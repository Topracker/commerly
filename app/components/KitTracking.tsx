'use client'
import { useEffect, useState } from 'react'
import { Check, Loader2, Package, CreditCard, Factory, Boxes, Truck, Bike, Home, BadgeCheck } from 'lucide-react'

// ============================================================================
// Rastreio do kit do entregador — a régua de status estilo Amazon.
// ----------------------------------------------------------------------------
// Antes o /kit descrevia as etapas em texto ("Pagamento, Produção, ..."), sem
// nada por trás. Agora cada etapa vem de `kit_pedidos.status`, e o histórico de
// datas sai do JSONB que o gatilho `trg_kit_status` preenche a cada mudança.
// ============================================================================

const ETAPAS = [
  { id: 'aguardando_pagamento', label: 'Pagamento',        Icone: CreditCard },
  { id: 'producao',             label: 'Produção',          Icone: Factory },
  { id: 'embalado',             label: 'Embalado',          Icone: Boxes },
  { id: 'enviado',              label: 'Enviado',           Icone: Truck },
  { id: 'saiu_entrega',         label: 'Saiu para entrega', Icone: Bike },
  { id: 'recebido',             label: 'Recebido',          Icone: Home },
  { id: 'ativado',              label: 'Conta ativada',     Icone: BadgeCheck },
]

type Kit = {
  id: string
  status: string
  codigo_rastreio: string | null
  valor: number | null
  historico: { status: string; em: string }[]
  created_at: string
  updated_at: string
}

type Resposta = {
  kit: Kit | null
  autenticado: boolean
  entregador?: boolean
  nome?: string
  preco?: { base: number; descontoPct: number; final: number }
}

function dataDe(k: Kit | null, status: string): string | null {
  const h = (k?.historico || []).find(x => x.status === status)
  return h ? new Date(h.em).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) : null
}

export function KitTracking() {
  const [d, setD] = useState<Resposta | null>(null)
  const [pedindo, setPedindo] = useState(false)

  async function carregar() {
    const j = await fetch('/api/kit').then(r => (r.ok ? r.json() : null)).catch(() => null)
    if (j) setD(j)
  }
  useEffect(() => { carregar() }, [])

  async function pedir() {
    setPedindo(true)
    try {
      await fetch('/api/kit', { method: 'POST' })
      await carregar()
    } finally { setPedindo(false) }
  }

  // Visitante ou não-entregador: a página segue sendo a de marketing, sem
  // rastreio nenhum. Nada de pedir login para quem só veio conhecer o kit.
  if (!d || !d.autenticado || !d.entregador) return null

  if (!d.kit) {
    return (
      <div className="bg-card border border-borda rounded-2xl p-5 mb-6">
        <p className="text-white font-semibold flex items-center gap-2"><Package size={17} className="text-acento" /> Seu kit</p>
        <p className="text-gray-400 text-sm mt-1.5">
          Você ainda não pediu o kit. Ele é o que ativa a sua conta de entregador.
        </p>
        {d.preco && (
          <p className="text-sm mt-3">
            <span className="text-white font-bold text-lg">R$ {d.preco.final.toFixed(2).replace('.', ',')}</span>
            {d.preco.descontoPct > 0 && (
              <>
                <span className="text-gray-500 line-through ml-2">R$ {d.preco.base.toFixed(2).replace('.', ',')}</span>
                <span className="ml-2 text-green-400 text-xs font-semibold">-{d.preco.descontoPct}% pelo seu nível</span>
              </>
            )}
          </p>
        )}
        <button
          onClick={pedir}
          disabled={pedindo}
          className="mt-4 bg-acento hover:bg-acento-forte disabled:opacity-60 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition flex items-center gap-2"
        >
          {pedindo && <Loader2 size={15} className="animate-spin" />}
          {pedindo ? 'Abrindo pedido…' : 'Pedir meu kit'}
        </button>
      </div>
    )
  }

  const kit = d.kit
  const cancelado = kit.status === 'cancelado'
  const atual = ETAPAS.findIndex(e => e.id === kit.status)

  return (
    <div className="bg-card border border-borda rounded-2xl p-5 mb-6">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-5">
        <div>
          <p className="text-white font-semibold flex items-center gap-2"><Package size={17} className="text-acento" /> Seu kit</p>
          <p className="text-gray-500 text-xs mt-1">Pedido #{kit.id.slice(0, 8)}</p>
        </div>
        {kit.codigo_rastreio && (
          <div className="text-right">
            <p className="text-gray-500 text-xs">Rastreio</p>
            <p className="text-white text-sm font-mono">{kit.codigo_rastreio}</p>
          </div>
        )}
      </div>

      {cancelado ? (
        <p className="text-gray-400 text-sm">Este pedido foi cancelado.</p>
      ) : (
        <ol className="relative">
          {ETAPAS.map((e, i) => {
            const feito = i < atual
            const agora = i === atual
            const data = dataDe(kit, e.id)
            return (
              <li key={e.id} className="flex gap-3 pb-5 last:pb-0 relative">
                {/* Trilho ligando os passos */}
                {i < ETAPAS.length - 1 && (
                  <span
                    aria-hidden
                    className={`absolute left-[15px] top-8 bottom-0 w-[2px] ${feito ? 'bg-green-500' : 'bg-borda'}`}
                  />
                )}
                <span
                  className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center shrink-0 border ${
                    feito ? 'bg-green-500 border-green-500 text-white'
                    : agora ? 'bg-acento border-acento text-white'
                    : 'bg-superficie border-borda text-gray-600'
                  }`}
                >
                  {feito ? <Check size={15} /> : <e.Icone size={15} />}
                </span>
                <div className="min-w-0 pt-1">
                  <p className={`text-sm font-semibold ${feito || agora ? 'text-white' : 'text-gray-500'}`}>
                    {e.label}
                    {agora && <span className="ml-2 text-acento text-xs font-normal">em andamento</span>}
                  </p>
                  {data && <p className="text-gray-500 text-xs mt-0.5">{data}</p>}
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
