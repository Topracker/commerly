'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useCliente } from '../../hooks/useCliente'
import { ClienteLayout } from '../../components/ClienteLayout'
import { STATUS_META, FLUXO_STATUS, type PedidoCliente } from '../../lib/pedidosClientes'
import { ShoppingBag, MapPin, ChevronRight } from 'lucide-react'

export default function ClientePedidos() {
  const { cliente, loading, supabase, sair } = useCliente()
  const [pedidos, setPedidos] = useState<PedidoCliente[]>([])
  const [nomesLoja, setNomesLoja] = useState<Record<string, string>>({})
  const [carregando, setCarregando] = useState(true)
  const router = useRouter()

  useEffect(() => { if (cliente) carregar() }, [cliente])

  async function carregar() {
    const { data } = await supabase
      .from('pedidos_clientes')
      .select('*')
      .eq('cliente_id', cliente.id)
      .order('created_at', { ascending: false })

    const lista = (data || []) as PedidoCliente[]
    setPedidos(lista)

    const ids = [...new Set(lista.map(p => p.loja_id))]
    if (ids.length > 0) {
      const { data: lojas } = await supabase.from('lojas_publicas').select('id, nome').in('id', ids)
      const mapa: Record<string, string> = {}
      for (const l of lojas || []) mapa[l.id] = l.nome
      setNomesLoja(mapa)
    }
    setCarregando(false)
  }

  if (loading) return (
    <main className="min-h-screen bg-gray-950 flex items-center justify-center">
      <p className="text-gray-400">Carregando...</p>
    </main>
  )
  if (!cliente) return null

  return (
    <ClienteLayout cliente={cliente} sair={sair}>
      <div className="max-w-2xl mx-auto font-body">
        <h1 className="font-display text-2xl font-bold text-white mb-1">Meus pedidos</h1>
        <p className="text-gray-400 text-sm mb-6">Acompanhe o status das suas entregas</p>

        {carregando ? (
          <p className="text-gray-500 text-sm">Carregando...</p>
        ) : pedidos.length === 0 ? (
          <div className="bg-[#12161B] border border-[#232A32] rounded-2xl p-8 text-center">
            <ShoppingBag size={40} className="text-gray-600 mx-auto mb-3" />
            <p className="text-gray-400 text-sm">Você ainda não fez nenhum pedido.</p>
            <button
              onClick={() => router.push('/cliente/buscar')}
              className="mt-4 inline-flex items-center gap-1.5 text-green-400 text-sm font-medium hover:text-green-300"
            >
              Buscar lojas <ChevronRight size={16} />
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {pedidos.map(p => {
              const meta = STATUS_META[p.status]
              const passoAtual = FLUXO_STATUS.indexOf(p.status)
              return (
                <div key={p.id} className="bg-[#12161B] border border-[#232A32] rounded-2xl p-4">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="min-w-0">
                      <p className="text-white font-semibold truncate">{nomesLoja[p.loja_id] || 'Loja'}</p>
                      <p className="text-gray-500 text-xs">{new Date(p.created_at).toLocaleString('pt-BR')}</p>
                    </div>
                    <span className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full border ${meta.classes}`}>
                      {meta.emoji} {meta.label}
                    </span>
                  </div>

                  {/* Linha de progresso */}
                  {p.status !== 'cancelado' && (
                    <div className="flex items-center gap-1 mb-3">
                      {FLUXO_STATUS.map((s, i) => (
                        <div key={s} className={`h-1.5 flex-1 rounded-full ${i <= passoAtual ? STATUS_META[s].dot : 'bg-[#232A32]'}`} />
                      ))}
                    </div>
                  )}

                  <div className="text-sm text-gray-300 flex flex-col gap-1">
                    {p.itens.map((it, i) => (
                      <div key={i} className="flex justify-between gap-2">
                        <span className="truncate">{it.quantidade}× {it.nome}</span>
                        <span className="text-gray-500 shrink-0">R$ {(it.preco * it.quantidade).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>

                  {Number(p.taxa_entrega) > 0 && (
                    <div className="flex justify-between gap-2 text-xs text-gray-500 mt-1">
                      <span>Taxa de entrega</span>
                      <span>R$ {Number(p.taxa_entrega).toFixed(2)}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-2 mt-3 pt-3 border-t border-[#232A32]">
                    <p className="text-gray-500 text-xs flex items-center gap-1.5 min-w-0">
                      <MapPin size={13} className="shrink-0" /><span className="truncate">{p.endereco_entrega}</span>
                    </p>
                    <p className="font-display text-white font-bold shrink-0">R$ {Number(p.total).toFixed(2)}</p>
                  </div>
                  {p.observacao && <p className="text-gray-500 text-xs mt-2 italic">"{p.observacao}"</p>}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </ClienteLayout>
  )
}
