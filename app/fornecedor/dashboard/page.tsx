'use client'
import { useEffect, useState } from 'react'
import { useFornecedor } from '../../hooks/useFornecedor'
import { useToast } from '../../hooks/useToast'
import { Toast } from '../../components/Toast'
import { FornecedorLayout } from '../../components/FornecedorLayout'
import { Estrelas } from '../../components/Estrelas'
import { STATUS_META, type Pedido, type StatusPedido } from '../../lib/pedidos'
import { Eye, MessageCircle, Star, TrendingUp, ShoppingCart, Check, X, Truck } from 'lucide-react'

type FiltroPedido = 'pendente' | 'aceito' | 'recusado' | 'entregue' | 'todos'

export default function FornecedorDashboard() {
  const { fornecedor, loading, supabase, sair } = useFornecedor()
  const { toast, mostrarToast } = useToast()
  const [stats, setStats] = useState({ views: 0, contatos: 0, mediaAval: 0, totalAval: 0 })
  const [avaliacoes, setAvaliacoes] = useState<any[]>([])
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [lojasNomes, setLojasNomes] = useState<Record<string, string>>({})
  const [filtro, setFiltro] = useState<FiltroPedido>('pendente')
  const [atualizandoId, setAtualizandoId] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(false)

  useEffect(() => {
    if (fornecedor) { carregarStats(); carregarPedidos() }
  }, [fornecedor])

  async function carregarStats() {
    setCarregando(true)
    const [viewsRes, contatosRes, avalRes] = await Promise.all([
      supabase.from('visualizacoes_fornecedor').select('id', { count: 'exact' }).eq('fornecedor_id', fornecedor.id),
      supabase.from('contatos_fornecedor').select('id', { count: 'exact' }).eq('fornecedor_id', fornecedor.id),
      supabase.from('avaliacoes_fornecedores').select('nota, comentario, created_at').eq('fornecedor_id', fornecedor.id).order('created_at', { ascending: false }),
    ])

    const avals = avalRes.data || []
    const media = avals.length > 0 ? avals.reduce((s: number, a: any) => s + a.nota, 0) / avals.length : 0
    setStats({
      views: viewsRes.count || 0,
      contatos: contatosRes.count || 0,
      mediaAval: media,
      totalAval: avals.length,
    })
    setAvaliacoes(avals)
    setCarregando(false)
  }

  async function carregarPedidos() {
    const { data } = await supabase
      .from('pedidos')
      .select('*')
      .eq('fornecedor_id', fornecedor.id)
      .order('created_at', { ascending: false })
    const lista = (data as Pedido[]) || []
    setPedidos(lista)

    const lojaIds = [...new Set(lista.map(p => p.loja_id))]
    if (lojaIds.length > 0) {
      const { data: lojas } = await supabase.from('lojas_publicas').select('id, nome').in('id', lojaIds)
      const mapa: Record<string, string> = {}
      lojas?.forEach((l: any) => { mapa[l.id] = l.nome })
      setLojasNomes(mapa)
    }
  }

  async function mudarStatus(pedido: Pedido, status: StatusPedido) {
    setAtualizandoId(pedido.id)
    const { error } = await supabase
      .from('pedidos')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', pedido.id)
      .eq('fornecedor_id', fornecedor.id)
    setAtualizandoId(null)
    if (error) { mostrarToast('Erro ao atualizar pedido', 'erro'); return }
    setPedidos(prev => prev.map(p => (p.id === pedido.id ? { ...p, status } : p)))
    mostrarToast(`Pedido marcado como ${STATUS_META[status].label.toLowerCase()}`, 'sucesso')
  }

  const pedidosFiltrados = filtro === 'todos' ? pedidos : pedidos.filter(p => p.status === filtro)
  const pendentesCount = pedidos.filter(p => p.status === 'pendente').length

  if (loading) return (
    <main className="min-h-screen bg-gray-950 flex items-center justify-center">
      <p className="text-gray-400">Carregando...</p>
    </main>
  )
  if (!fornecedor) return null

  return (
    <FornecedorLayout fornecedor={fornecedor} sair={sair} titulo="Dashboard">
      <Toast toast={toast} />
      {carregando ? (
        <div className="text-center py-12 text-gray-500">Carregando...</div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 mb-6">
            <div className="bg-gray-900 rounded-2xl p-4 flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-900 rounded-xl flex items-center justify-center">
                <Eye size={18} className="text-blue-400" />
              </div>
              <div>
                <p className="text-gray-400 text-xs">Visualizações</p>
                <p className="text-white text-2xl font-bold">{stats.views}</p>
              </div>
            </div>

            <div className="bg-gray-900 rounded-2xl p-4 flex items-center gap-3">
              <div className="w-10 h-10 bg-green-900 rounded-xl flex items-center justify-center">
                <MessageCircle size={18} className="text-green-400" />
              </div>
              <div>
                <p className="text-gray-400 text-xs">Contatos</p>
                <p className="text-white text-2xl font-bold">{stats.contatos}</p>
              </div>
            </div>

            <div className="bg-gray-900 rounded-2xl p-4 flex items-center gap-3">
              <div className="w-10 h-10 bg-yellow-900 rounded-xl flex items-center justify-center">
                <Star size={18} className="text-yellow-400" />
              </div>
              <div>
                <p className="text-gray-400 text-xs">Nota média</p>
                <p className="text-white text-2xl font-bold">
                  {stats.totalAval > 0 ? stats.mediaAval.toFixed(1) : '—'}
                </p>
              </div>
            </div>

            <div className="bg-gray-900 rounded-2xl p-4 flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-900 rounded-xl flex items-center justify-center">
                <TrendingUp size={18} className="text-purple-400" />
              </div>
              <div>
                <p className="text-gray-400 text-xs">Avaliações</p>
                <p className="text-white text-2xl font-bold">{stats.totalAval}</p>
              </div>
            </div>
          </div>

          {/* Pedidos recebidos */}
          <div className="bg-gray-900 rounded-2xl p-5 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white font-semibold flex items-center gap-2">
                <ShoppingCart size={18} className="text-purple-400" />
                Pedidos recebidos
              </h2>
              {pendentesCount > 0 && (
                <span className="bg-yellow-900/50 text-yellow-300 text-xs font-medium px-2 py-0.5 rounded-full">
                  {pendentesCount} pendente{pendentesCount !== 1 ? 's' : ''}
                </span>
              )}
            </div>

            <div className="flex gap-2 overflow-x-auto pb-2 mb-4 scrollbar-hide">
              {([
                { id: 'pendente', label: 'Pendentes' },
                { id: 'aceito', label: 'Aceitos' },
                { id: 'entregue', label: 'Entregues' },
                { id: 'recusado', label: 'Recusados' },
                { id: 'todos', label: 'Todos' },
              ] as const).map(t => (
                <button
                  key={t.id}
                  onClick={() => setFiltro(t.id)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition ${
                    filtro === t.id ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {pedidosFiltrados.length === 0 ? (
              <p className="text-gray-500 text-sm text-center py-6">Nenhum pedido nesta categoria.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {pedidosFiltrados.map(p => (
                  <div key={p.id} className="bg-gray-800/50 rounded-xl p-4">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <p className="text-white font-semibold truncate">{lojasNomes[p.loja_id] || 'Loja'}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${STATUS_META[p.status].classes}`}>
                        {STATUS_META[p.status].label}
                      </span>
                    </div>
                    <div className="flex flex-col gap-0.5 mb-2">
                      {p.itens.map((i, idx) => (
                        <p key={idx} className="text-gray-300 text-sm">
                          {i.quantidade}x {i.nome}
                          <span className="text-gray-500"> — R$ {(i.preco * i.quantidade).toFixed(2)}</span>
                        </p>
                      ))}
                    </div>
                    {p.observacao && <p className="text-gray-400 text-sm italic mb-2">"{p.observacao}"</p>}
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-purple-400 font-bold">R$ {p.total.toFixed(2)}</p>
                      <p className="text-gray-500 text-xs">{new Date(p.created_at).toLocaleDateString('pt-BR')}</p>
                    </div>

                    {p.status === 'pendente' && (
                      <div className="flex gap-2 mt-3">
                        <button
                          onClick={() => mudarStatus(p, 'aceito')}
                          disabled={atualizandoId === p.id}
                          className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium py-2 rounded-lg transition flex items-center justify-center gap-1"
                        >
                          <Check size={14} /> Aceitar
                        </button>
                        <button
                          onClick={() => mudarStatus(p, 'recusado')}
                          disabled={atualizandoId === p.id}
                          className="flex-1 bg-red-900 hover:bg-red-800 disabled:opacity-50 text-red-300 text-sm font-medium py-2 rounded-lg transition flex items-center justify-center gap-1"
                        >
                          <X size={14} /> Recusar
                        </button>
                      </div>
                    )}
                    {p.status === 'aceito' && (
                      <button
                        onClick={() => mudarStatus(p, 'entregue')}
                        disabled={atualizandoId === p.id}
                        className="w-full mt-3 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-medium py-2 rounded-lg transition flex items-center justify-center gap-1"
                      >
                        <Truck size={14} /> Marcar como entregue
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-gray-900 rounded-2xl p-5 mb-6">
            <h2 className="text-white font-semibold mb-2">Seu perfil público</h2>
            <p className="text-gray-400 text-sm mb-3">Compartilhe o link do seu perfil com clientes e comércios.</p>
            <div className="flex gap-2">
              <input
                readOnly
                value={typeof window !== 'undefined' ? `${window.location.origin}/fornecedor/${fornecedor.id}` : ''}
                className="flex-1 bg-gray-800 text-gray-300 rounded-xl px-4 py-2 text-sm outline-none"
              />
              <button
                onClick={() => navigator.clipboard?.writeText(`${window.location.origin}/fornecedor/${fornecedor.id}`)}
                className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-xl text-sm transition"
              >
                Copiar
              </button>
            </div>
          </div>

          {avaliacoes.length > 0 && (
            <div className="bg-gray-900 rounded-2xl p-5">
              <h2 className="text-white font-semibold mb-4">Avaliações recebidas</h2>
              <div className="flex flex-col gap-3">
                {avaliacoes.map((a, i) => (
                  <div key={i} className="border-b border-gray-800 pb-3">
                    <div className="flex items-center gap-2 mb-1">
                      <Estrelas nota={a.nota} tamanho="text-base" />
                      <span className="text-gray-500 text-xs">{new Date(a.created_at).toLocaleDateString('pt-BR')}</span>
                    </div>
                    {a.comentario && <p className="text-gray-300 text-sm">{a.comentario}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {avaliacoes.length === 0 && (
            <div className="bg-gray-900 rounded-2xl p-8 text-center text-gray-500">
              Nenhuma avaliação ainda. Compartilhe seu perfil para receber avaliações!
            </div>
          )}
        </>
      )}
    </FornecedorLayout>
  )
}
