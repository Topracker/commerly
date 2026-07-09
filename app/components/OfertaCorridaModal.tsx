'use client'
import { useEffect, useRef, useState } from 'react'
import { Bike, MapPin, Store, Check, X } from 'lucide-react'
import { TEMPO_RESPOSTA_CORRIDA_S, type OfertaCorrida } from '../lib/entregadores'
import type { PedidoCliente } from '../lib/pedidosClientes'
import { formatarDistancia } from '../lib/geo'

type Props = {
  oferta: OfertaCorrida
  pedido: PedidoCliente | null
  nomeLoja: string
  respondendo: boolean
  onAceitar: () => void
  onRecusar: () => void
  onExpirar: () => void
}

const reais = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`

/**
 * Modal de OFERTA DE CORRIDA (estilo Uber/iFood). Aparece quando uma loja
 * próxima chama o entregador. Barra de progresso + contagem regressiva de 30s;
 * ao zerar, chama onExpirar (o servidor expira a oferta e passa ao próximo).
 */
export function OfertaCorridaModal({ oferta, pedido, nomeLoja, respondendo, onAceitar, onRecusar, onExpirar }: Props) {
  // Segundos restantes calculados a partir de expira_em (fonte da verdade).
  const totalMs = TEMPO_RESPOSTA_CORRIDA_S * 1000
  const [restanteMs, setRestanteMs] = useState(() => Math.max(0, new Date(oferta.expira_em).getTime() - Date.now()))
  const expirouRef = useRef(false)

  useEffect(() => {
    expirouRef.current = false
    const tick = () => {
      const ms = Math.max(0, new Date(oferta.expira_em).getTime() - Date.now())
      setRestanteMs(ms)
      if (ms <= 0 && !expirouRef.current) { expirouRef.current = true; onExpirar() }
    }
    tick()
    const iv = setInterval(tick, 200)
    return () => clearInterval(iv)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oferta.id, oferta.expira_em])

  const segundos = Math.ceil(restanteMs / 1000)
  const pct = Math.max(0, Math.min(100, (restanteMs / totalMs) * 100))
  const dist = oferta.distancia_km != null ? Number(oferta.distancia_km) : null
  const valor = pedido ? Number(pedido.valor_corrida) : 0

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-5 z-[60] backdrop-blur-sm">
      <div className="bg-card border border-acento/50 rounded-3xl p-6 w-full max-w-sm shadow-2xl">
        {/* Cabeçalho pulsante */}
        <div className="flex flex-col items-center text-center mb-4">
          <div className="w-16 h-16 rounded-2xl bg-acento/20 flex items-center justify-center mb-3 animate-pulse">
            <Bike size={30} className="text-acento" />
          </div>
          <h3 className="text-white font-bold text-xl">Nova corrida!</h3>
          <p className="text-gray-400 text-sm">Uma loja próxima está te chamando</p>
        </div>

        {/* Contagem regressiva */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-gray-400 text-xs">Responda em</span>
            <span className={`font-bold text-sm ${segundos <= 10 ? 'text-red-400' : 'text-amber-300'}`}>{segundos}s</span>
          </div>
          <div className="h-2 w-full rounded-full bg-elevado overflow-hidden">
            <div
              className={`h-full rounded-full transition-[width] duration-200 ease-linear ${segundos <= 10 ? 'bg-red-500' : 'bg-acento'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {/* Detalhes */}
        <div className="bg-superficie border border-borda rounded-2xl p-4 mb-5 flex flex-col gap-2.5">
          <div className="flex items-center gap-2 text-sm">
            <Store size={15} className="text-acento shrink-0" />
            <span className="text-white font-semibold truncate">{nomeLoja}</span>
            {dist != null && <span className="ml-auto text-gray-400 text-xs shrink-0">{formatarDistancia(dist)} de você</span>}
          </div>
          {pedido?.endereco_entrega && (
            <div className="flex items-start gap-2 text-xs text-gray-400">
              <MapPin size={13} className="shrink-0 mt-0.5" />
              <span className="line-clamp-2">{pedido.endereco_entrega}</span>
            </div>
          )}
          <div className="flex items-center justify-between pt-2 border-t border-borda">
            <span className="text-gray-500 text-xs">Você recebe</span>
            <span className="text-acento font-bold text-lg">{valor > 0 ? reais(valor) : 'A definir'}</span>
          </div>
        </div>

        {/* Ações */}
        <div className="flex gap-3">
          <button
            onClick={onRecusar}
            disabled={respondendo}
            className="flex-1 flex items-center justify-center gap-1.5 bg-elevado border border-borda hover:bg-red-500/15 hover:border-red-500/40 text-gray-300 hover:text-red-400 font-semibold py-3 rounded-xl transition disabled:opacity-50"
          >
            <X size={17} /> Recusar
          </button>
          <button
            onClick={onAceitar}
            disabled={respondendo}
            className="flex-[1.6] flex items-center justify-center gap-1.5 bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-xl transition disabled:opacity-50"
          >
            <Check size={18} /> {respondendo ? 'Aceitando...' : 'Aceitar corrida'}
          </button>
        </div>
      </div>
    </div>
  )
}
