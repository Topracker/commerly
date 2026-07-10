'use client'
// #12 Radar de tendências — card no dashboard do comerciante.

import { useEffect, useState } from 'react'
import { Flame, TrendingUp } from 'lucide-react'
import { fraseTendencia, type Tendencia } from '../lib/tendencias'

export function TendenciasCard() {
  const [tendencia, setTendencia] = useState<Tendencia | null>(null)
  const [motivo, setMotivo] = useState('')
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    let vivo = true
    fetch('/api/tendencias')
      .then(r => r.json())
      .then(d => {
        if (!vivo) return
        setTendencia(d.tendencia ?? null)
        setMotivo(d.motivo ?? '')
      })
      .catch(() => { if (vivo) setMotivo('Não foi possível carregar as tendências.') })
      .finally(() => { if (vivo) setCarregando(false) })
    return () => { vivo = false }
  }, [])

  if (carregando) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="h-4 w-32 animate-pulse rounded bg-white/10" />
        <div className="mt-3 h-6 w-3/4 animate-pulse rounded bg-white/10" />
      </div>
    )
  }

  // Sem massa crítica de pedidos, dizemos isso — em vez de inventar uma tendência.
  if (!tendencia || tendencia.itens.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <p className="flex items-center gap-2 text-sm font-medium text-white">
          <TrendingUp className="h-4 w-4" /> Radar de tendências
        </p>
        <p className="mt-2 text-sm text-gray-500">{motivo || 'Sem dados suficientes ainda.'}</p>
      </div>
    )
  }

  const [topo, ...resto] = tendencia.itens

  return (
    <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-orange-500/10 to-transparent p-5">
      <p className="flex items-center gap-2 text-xs uppercase tracking-wide text-gray-400">
        <Flame className="h-3.5 w-3.5 text-orange-400" /> Tendência na sua cidade
      </p>

      <p className="mt-2 font-display text-lg font-bold text-white">{fraseTendencia(tendencia)}</p>
      <p className="mt-1 text-sm text-gray-400">
        {topo.quantidade} {topo.quantidade === 1 ? 'unidade pedida' : 'unidades pedidas'} nas últimas 24h,
        em {topo.lojas} {topo.lojas === 1 ? 'loja' : 'lojas'}.
      </p>

      {resto.length > 0 && (
        <div className="mt-3 border-t border-white/10 pt-3">
          <p className="mb-1.5 text-xs text-gray-500">Também em alta</p>
          <ul className="space-y-1">
            {resto.map(i => (
              <li key={i.nome} className="flex justify-between text-sm">
                <span className="text-gray-300">{i.nome}</span>
                <span className="text-gray-500">{i.quantidade}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-3 text-[11px] text-gray-600">
        Baseado em {tendencia.pedidos} pedidos. Atualiza a cada hora.
      </p>
    </div>
  )
}
