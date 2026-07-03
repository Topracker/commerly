'use client'
import { useState, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import { AppLayout } from '../components/AppLayout'
import { Toast } from '../components/Toast'
import { isDelivery, STATUS_META, FLUXO_STATUS, proximoStatus, pedidoEmAndamento, type PedidoCliente, type StatusPedidoCliente } from '../lib/pedidosClientes'
import type { ParceriaEntregador } from '../lib/entregadores'
import { MapPin, Phone, ShoppingBag, ChevronRight, Ban, Bike, Check, X, CircleDollarSign } from 'lucide-react'

type EntregadorPublico = { id: string; nome: string; foto_url: string | null; telefone: string | null }

export default function PedidosComerciante() {
  const { loja, loading, supabase, sair } = useAuth()
  const { toast, mostrarToast } = useToast()
  const [pedidos, setPedidos] = useState<PedidoCliente[]>([])
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState<string | null>(null)
  // Entregadores: solicitações de parceria + cache de nomes por id.
  const [parcerias, setParcerias] = useState<ParceriaEntregador[]>([])
  const [entregadores, setEntregadores] = useState<Record<string, EntregadorPublico>>({})
  const [corridas, setCorridas] = useState<Record<string, string>>({})

  useEffect(() => { if (loja) carregar() }, [loja])

  async function carregar() {
    const [pedidosRes, parceriasRes] = await Promise.all([
      supabase.from('pedidos_clientes').select('*').eq('loja_id', loja.id).order('created_at', { ascending: false }),
      supabase.from('entregador_parcerias').select('*').eq('loja_id', loja.id).order('created_at', { ascending: false }),
    ])
    const lista = (pedidosRes.data || []) as PedidoCliente[]
    const pars = (parceriasRes.data || []) as ParceriaEntregador[]
    setPedidos(lista)
    setParcerias(pars)
    // Semeia os inputs de corrida com o valor já salvo.
    const cmap: Record<string, string> = {}
    for (const p of lista) if (Number(p.valor_corrida) > 0) cmap[p.id] = String(Number(p.valor_corrida))
    setCorridas(cmap)

    // Nomes/fotos dos entregadores (parceiros + atribuídos) via view pública.
    const ids = [...new Set([
      ...pars.map(p => p.entregador_id),
      ...lista.map(p => p.entregador_id).filter(Boolean) as string[],
    ])]
    if (ids.length > 0) {
      const { data: ents } = await supabase.from('entregadores_publicos').select('id, nome, foto_url, telefone').in('id', ids)
      const emap: Record<string, EntregadorPublico> = {}
      for (const e of (ents || []) as EntregadorPublico[]) emap[e.id] = e
      setEntregadores(emap)
    }
    setCarregando(false)
  }

  async function responderParceria(parceria: ParceriaEntregador, status: 'aceita' | 'recusada') {
    setSalvando(parceria.id)
    const { error } = await supabase.from('entregador_parcerias').update({ status }).eq('id', parceria.id)
    setSalvando(null)
    if (error) { mostrarToast('Erro ao responder a solicitação', 'erro'); return }
    setParcerias(prev => prev.map(p => (p.id === parceria.id ? { ...p, status } : p)))
    mostrarToast(status === 'aceita' ? 'Entregador aceito como parceiro!' : 'Solicitação recusada', 'sucesso')
  }

  async function salvarCorrida(pedido: PedidoCliente) {
    const valor = Math.max(0, Number(corridas[pedido.id] || 0))
    setSalvando(pedido.id)
    const { error } = await supabase.from('pedidos_clientes').update({ valor_corrida: valor }).eq('id', pedido.id)
    setSalvando(null)
    if (error) { mostrarToast('Erro ao salvar o valor da corrida', 'erro'); return }
    setPedidos(prev => prev.map(p => (p.id === pedido.id ? { ...p, valor_corrida: valor } : p)))
    mostrarToast(`Valor da corrida: R$ ${valor.toFixed(2)}`, 'sucesso')
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
  const pendentes = parcerias.filter(p => p.status === 'pendente')

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
          {Number(p.taxa_entrega) > 0 && (
            <p className="flex justify-between"><span>Taxa de entrega</span><span>R$ {Number(p.taxa_entrega).toFixed(2)}</span></p>
          )}
          <p className="font-display text-white font-bold text-sm mt-1">Total: R$ {Number(p.total).toFixed(2)}</p>
        </div>

        {/* Entrega por entregador parceiro */}
        <div className="mt-3 pt-3 border-t border-[#232A32] flex flex-col gap-2">
          {p.entregador_id ? (
            <div className="flex items-center gap-2 text-sm">
              <Bike size={15} className="text-[#E0632C] shrink-0" />
              <span className="text-gray-300 truncate">Entregador: <strong className="text-white">{entregadores[p.entregador_id]?.nome || 'atribuído'}</strong></span>
              {p.status === 'entregue' && (
                <span className={`ml-auto shrink-0 text-[11px] px-2 py-0.5 rounded-full ${p.pagamento_corrida === 'pago' ? 'bg-green-500/15 text-green-300' : 'bg-amber-500/15 text-amber-300'}`}>
                  {p.pagamento_corrida === 'pago' ? 'Corrida paga' : 'Pagamento pendente'}
                </span>
              )}
            </div>
          ) : pedidoEmAndamento(p.status) ? (
            <p className="text-gray-500 text-xs">Nenhum entregador aceitou ainda.</p>
          ) : null}

          {pedidoEmAndamento(p.status) && (
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <CircleDollarSign size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  value={corridas[p.id] || ''}
                  onChange={e => setCorridas(prev => ({ ...prev, [p.id]: e.target.value.replace(/[^\d.,]/g, '').replace(',', '.') }))}
                  inputMode="decimal"
                  placeholder="Valor da corrida (R$)"
                  className="w-full bg-[#171C22] border border-[#232A32] text-white rounded-lg pl-8 pr-3 py-2 text-sm outline-none focus:border-[#C1441E]/60"
                />
              </div>
              <button
                onClick={() => salvarCorrida(p)}
                disabled={salvando === p.id}
                className="shrink-0 bg-[#1B2129] border border-[#232A32] hover:border-[#C1441E]/60 text-white text-sm font-semibold px-3 py-2 rounded-lg transition disabled:opacity-50"
              >
                Salvar
              </button>
            </div>
          )}
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
        {/* Solicitações de parceria de entregadores */}
        {pendentes.length > 0 && (
          <div className="mb-6">
            <h2 className="font-display text-white font-semibold mb-3 flex items-center gap-2">
              <Bike size={16} className="text-[#E0632C]" /> Solicitações de entregadores
              <span className="bg-[#C1441E] text-white text-xs rounded-full px-2 py-0.5 font-bold">{pendentes.length}</span>
            </h2>
            <div className="flex flex-col gap-2">
              {pendentes.map(par => {
                const e = entregadores[par.entregador_id]
                return (
                  <div key={par.id} className="bg-[#12161B] border border-[#232A32] rounded-2xl p-4 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-[#C1441E]/15 overflow-hidden flex items-center justify-center shrink-0">
                      {e?.foto_url ? <img src={e.foto_url} alt="" className="w-full h-full object-cover" /> : <Bike size={16} className="text-[#E0632C]" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-semibold text-sm truncate">{e?.nome || 'Entregador'}</p>
                      {e?.telefone && <p className="text-gray-500 text-xs">{e.telefone}</p>}
                    </div>
                    <button onClick={() => responderParceria(par, 'aceita')} disabled={salvando === par.id}
                      aria-label="Aceitar" className="shrink-0 w-9 h-9 flex items-center justify-center rounded-lg bg-green-600 hover:bg-green-700 text-white disabled:opacity-50">
                      <Check size={16} />
                    </button>
                    <button onClick={() => responderParceria(par, 'recusada')} disabled={salvando === par.id}
                      aria-label="Recusar" className="shrink-0 w-9 h-9 flex items-center justify-center rounded-lg bg-[#1B2129] border border-[#232A32] hover:bg-red-500/15 text-gray-400 hover:text-red-400 disabled:opacity-50">
                      <X size={16} />
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}

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
