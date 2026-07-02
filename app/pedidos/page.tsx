'use client'
import { useState, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import { AppLayout } from '../components/AppLayout'
import { Toast } from '../components/Toast'
import { isDelivery, STATUS_META, FLUXO_STATUS, proximoStatus, pedidoEmAndamento, type PedidoCliente, type StatusPedidoCliente } from '../lib/pedidosClientes'
import { MapPin, Phone, ShoppingBag, ChevronRight, Ban } from 'lucide-react'

export default function PedidosComerciante() {
  const { loja, loading, supabase, sair } = useAuth()
  const { toast, mostrarToast } = useToast()
  const [pedidos, setPedidos] = useState<PedidoCliente[]>([])
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState<string | null>(null)

  useEffect(() => { if (loja) carregar() }, [loja])

  async function carregar() {
    const { data } = await supabase
      .from('pedidos_clientes')
      .select('*')
      .eq('loja_id', loja.id)
      .order('created_at', { ascending: false })
    setPedidos((data || []) as PedidoCliente[])
    setCarregando(false)
  }

  async function mudarStatus(pedido: PedidoCliente, novo: StatusPedidoCliente) {
    setSalvando(pedido.id)
    const { error } = await supabase.from('pedidos_clientes').update({ status: novo }).eq('id', pedido.id)
    setSalvando(null)
    if (error) { mostrarToast('Erro ao atualizar o pedido', 'erro'); return }
    setPedidos(prev => prev.map(p => (p.id === pedido.id ? { ...p, status: novo } : p)))
    mostrarToast(`Pedido: ${STATUS_META[novo].label}`, 'sucesso')
  }

  if (loading) return (
    <main className="min-h-screen bg-gray-950 flex items-center justify-center">
      <p className="text-gray-400">Carregando...</p>
    </main>
  )
  if (!loja) return null

  if (!isDelivery(loja.tipo)) {
    return (
      <AppLayout loja={loja} sair={sair} titulo="Pedidos online">
        <div className="bg-[#12161B] border border-[#232A32] rounded-2xl p-8 text-center max-w-lg">
          <ShoppingBag size={40} className="text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400 text-sm">Os pedidos de delivery estão disponíveis para lojas dos nichos de comida (Pizzaria, Hamburgueria, Lanchonete, Restaurante, Delivery).</p>
        </div>
      </AppLayout>
    )
  }

  const ativos = pedidos.filter(p => pedidoEmAndamento(p.status))
  const concluidos = pedidos.filter(p => !pedidoEmAndamento(p.status))

  const Cartao = ({ p }: { p: PedidoCliente }) => {
    const meta = STATUS_META[p.status]
    const passo = FLUXO_STATUS.indexOf(p.status)
    const prox = proximoStatus(p.status)
    return (
      <div className="bg-[#12161B] border border-[#232A32] rounded-2xl p-4">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="min-w-0">
            <p className="text-white font-semibold truncate">{p.cliente_nome || 'Cliente'}</p>
            <p className="text-gray-500 text-xs">{new Date(p.created_at).toLocaleString('pt-BR')}</p>
          </div>
          <span className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full border ${meta.classes}`}>
            {meta.emoji} {meta.label}
          </span>
        </div>

        {p.status !== 'cancelado' && (
          <div className="flex items-center gap-1 mb-3">
            {FLUXO_STATUS.map((s, i) => (
              <div key={s} className={`h-1.5 flex-1 rounded-full ${i <= passo ? STATUS_META[s].dot : 'bg-[#232A32]'}`} />
            ))}
          </div>
        )}

        <div className="text-sm text-gray-300 flex flex-col gap-1 mb-3">
          {p.itens.map((it, i) => (
            <div key={i} className="flex justify-between gap-2">
              <span className="truncate">{it.quantidade}× {it.nome}</span>
              <span className="text-gray-500 shrink-0">R$ {(it.preco * it.quantidade).toFixed(2)}</span>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-1.5 text-xs text-gray-400 border-t border-[#232A32] pt-3">
          <p className="flex items-start gap-1.5"><MapPin size={13} className="shrink-0 mt-0.5" /><span>{p.endereco_entrega}</span></p>
          {p.cliente_telefone && (
            <a href={`https://wa.me/55${p.cliente_telefone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-green-400 hover:text-green-300 w-fit">
              <Phone size={13} className="shrink-0" />{p.cliente_telefone}
            </a>
          )}
          {p.observacao && <p className="italic">"{p.observacao}"</p>}
          <p className="font-display text-white font-bold text-sm mt-1">Total: R$ {Number(p.total).toFixed(2)}</p>
        </div>

        {pedidoEmAndamento(p.status) && (
          <div className="flex gap-2 mt-3">
            {prox ? (
              <button
                onClick={() => mudarStatus(p, prox)}
                disabled={salvando === p.id}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl transition flex items-center justify-center gap-1.5 text-sm"
              >
                {salvando === p.id ? 'Salvando...' : <>Avançar: {STATUS_META[prox].label} <ChevronRight size={15} /></>}
              </button>
            ) : null}
            <button
              onClick={() => mudarStatus(p, 'cancelado')}
              disabled={salvando === p.id}
              aria-label="Cancelar pedido"
              className="shrink-0 w-11 flex items-center justify-center bg-[#1B2129] border border-[#232A32] hover:bg-red-500/15 hover:border-red-500/40 text-gray-400 hover:text-red-400 rounded-xl transition"
            >
              <Ban size={16} />
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <AppLayout loja={loja} sair={sair} titulo="Pedidos online">
      <Toast toast={toast} />
      <div className="max-w-2xl">
        {carregando ? (
          <p className="text-gray-500 text-sm">Carregando...</p>
        ) : pedidos.length === 0 ? (
          <div className="bg-[#12161B] border border-[#232A32] rounded-2xl p-8 text-center">
            <ShoppingBag size={40} className="text-gray-600 mx-auto mb-3" />
            <p className="text-gray-400 text-sm">Nenhum pedido ainda. Os pedidos feitos pelos clientes aparecem aqui.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            <div>
              <h2 className="font-display text-white font-semibold mb-3 flex items-center gap-2">
                Em andamento
                {ativos.length > 0 && <span className="bg-blue-500 text-white text-xs rounded-full px-2 py-0.5 font-bold">{ativos.length}</span>}
              </h2>
              {ativos.length === 0 ? (
                <p className="text-gray-500 text-sm">Nenhum pedido em andamento.</p>
              ) : (
                <div className="flex flex-col gap-3">{ativos.map(p => <Cartao key={p.id} p={p} />)}</div>
              )}
            </div>

            {concluidos.length > 0 && (
              <div>
                <h2 className="font-display text-white font-semibold mb-3">Concluídos</h2>
                <div className="flex flex-col gap-3 opacity-70">{concluidos.map(p => <Cartao key={p.id} p={p} />)}</div>
              </div>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  )
}
