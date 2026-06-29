'use client'
import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '../../supabase'
import { Estrelas } from '../../components/Estrelas'
import { useToast } from '../../hooks/useToast'
import { Toast } from '../../components/Toast'
import { STATUS_META, type Pedido } from '../../lib/pedidos'
import { Phone, AtSign, MapPin, MessageCircle, ArrowLeft, Package, ShoppingCart, Plus, Minus, X } from 'lucide-react'

export default function FornecedorPerfil() {
  const { id } = useParams<{ id: string }>()
  const { toast, mostrarToast } = useToast()
  const [fornecedor, setFornecedor] = useState<any>(null)
  const [produtos, setProdutos] = useState<any[]>([])
  const [avaliacoes, setAvaliacoes] = useState<any[]>([])
  const [mediaAval, setMediaAval] = useState(0)
  const [minhaAvaliacao, setMinhaAvaliacao] = useState<any>(null)
  const [nota, setNota] = useState(0)
  const [comentario, setComentario] = useState('')
  const [enviandoAval, setEnviandoAval] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [lojaId, setLojaId] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [meusPedidos, setMeusPedidos] = useState<Pedido[]>([])
  const [modalPedido, setModalPedido] = useState(false)
  const [quantidades, setQuantidades] = useState<Record<string, number>>({})
  const [observacao, setObservacao] = useState('')
  const [enviandoPedido, setEnviandoPedido] = useState(false)
  const viewRegistered = useRef(false)
  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    if (id) carregar()
  }, [id])

  async function carregar() {
    setCarregando(true)
    const { data: { user } } = await supabase.auth.getUser()
    setUserId(user?.id ?? null)

    // Perfil publico — carrega dados do fornecedor mesmo sem sessao.
    // Consultas dependentes do user (loja, avaliacao propria) so rodam logado.
    const queries: any[] = [
      supabase.from('fornecedores').select('*').eq('id', id).single(),
      supabase.from('fornecedor_produtos').select('*').eq('fornecedor_id', id).order('created_at', { ascending: false }),
      supabase.from('avaliacoes_fornecedores').select('nota, comentario, created_at, user_id').eq('fornecedor_id', id).order('created_at', { ascending: false }),
    ]
    if (user) {
      queries.push(supabase.from('lojas').select('id').eq('user_id', user.id).maybeSingle())
    }

    const [fornRes, prodRes, avalRes, lojaRes] = await Promise.all(queries)

    if (fornRes.error || !fornRes.data) { router.push('/'); return }
    setFornecedor(fornRes.data)
    const minhaLojaId = lojaRes?.data?.id ?? null
    setLojaId(minhaLojaId)
    setProdutos(prodRes.data || [])

    // Se o visitante é um comerciante, carrega os pedidos que ele já fez a este fornecedor.
    if (minhaLojaId) carregarMeusPedidos(minhaLojaId)

    const avals = avalRes.data || []
    setAvaliacoes(avals)
    if (avals.length > 0) setMediaAval(avals.reduce((s: number, a: any) => s + a.nota, 0) / avals.length)

    if (user) {
      const minha = avals.find((a: any) => a.user_id === user.id)
      if (minha) { setMinhaAvaliacao(minha); setNota(minha.nota); setComentario(minha.comentario || '') }

      // Registrar visualizacao (apenas uma vez por carregamento, e nao se for o dono)
      if (!viewRegistered.current && fornRes.data.user_id !== user.id) {
        viewRegistered.current = true
        await supabase.from('visualizacoes_fornecedor').insert({ fornecedor_id: id, user_id: user.id })
      }
    }

    setCarregando(false)
  }

  async function enviarAvaliacao() {
    if (!userId) { router.push('/cliente/login'); return }
    if (nota === 0) { mostrarToast('Selecione uma nota!', 'erro'); return }
    if (userId === fornecedor?.user_id) { mostrarToast('Você não pode avaliar seu próprio perfil', 'erro'); return }
    setEnviandoAval(true)
    const { error } = minhaAvaliacao
      ? await supabase.from('avaliacoes_fornecedores').update({ nota, comentario }).eq('fornecedor_id', id).eq('user_id', userId)
      : await supabase.from('avaliacoes_fornecedores').insert({ fornecedor_id: id, user_id: userId, nota, comentario })
    if (error) { mostrarToast('Erro ao enviar avaliação', 'erro'); setEnviandoAval(false); return }
    mostrarToast(minhaAvaliacao ? 'Avaliação atualizada!' : 'Avaliação enviada!', 'sucesso')
    setEnviandoAval(false)
    carregar()
  }

  async function carregarMeusPedidos(minhaLojaId: string) {
    const { data } = await supabase
      .from('pedidos')
      .select('*')
      .eq('loja_id', minhaLojaId)
      .eq('fornecedor_id', id)
      .order('created_at', { ascending: false })
    setMeusPedidos((data as Pedido[]) || [])
  }

  function ajustarQtd(produtoId: string, delta: number) {
    setQuantidades(prev => {
      const atual = prev[produtoId] || 0
      const novo = Math.max(0, atual + delta)
      const copia = { ...prev }
      if (novo === 0) delete copia[produtoId]
      else copia[produtoId] = novo
      return copia
    })
  }

  const itensSelecionados = produtos
    .filter(p => (quantidades[p.id] || 0) > 0)
    .map(p => ({
      produto_id: p.id,
      nome: p.nome,
      preco: parseFloat(p.preco),
      quantidade: quantidades[p.id],
    }))

  const totalPedido = itensSelecionados.reduce((s, i) => s + i.preco * i.quantidade, 0)

  function abrirModalPedido() {
    setQuantidades({})
    setObservacao('')
    setModalPedido(true)
  }

  async function enviarPedido() {
    if (!lojaId) { router.push('/login'); return }
    if (itensSelecionados.length === 0) { mostrarToast('Selecione ao menos um produto', 'erro'); return }
    setEnviandoPedido(true)
    const { error } = await supabase.from('pedidos').insert({
      loja_id: lojaId,
      fornecedor_id: id,
      itens: itensSelecionados,
      total: totalPedido,
      observacao: observacao.trim() || null,
      status: 'pendente',
    })
    if (error) { mostrarToast('Erro ao enviar pedido', 'erro'); setEnviandoPedido(false); return }
    mostrarToast('Pedido enviado!', 'sucesso')
    setEnviandoPedido(false)
    setModalPedido(false)
    carregarMeusPedidos(lojaId)
  }

  async function registrarContato() {
    if (!fornecedor?.telefone) return
    if (userId && userId !== fornecedor?.user_id) {
      await supabase.from('contatos_fornecedor').insert({ fornecedor_id: fornecedor.id, user_id: userId })
    }
    const num = fornecedor.telefone.replace(/\D/g, '')
    window.open(`https://wa.me/55${num}?text=Olá! Vi seu perfil no Commerly e gostaria de saber mais.`, '_blank')
  }

  if (carregando) return (
    <main className="min-h-screen bg-gray-950 flex items-center justify-center">
      <p className="text-gray-400">Carregando...</p>
    </main>
  )
  if (!fornecedor) return null

  const isProprietario = userId === fornecedor.user_id

  return (
    <main className="min-h-screen bg-gray-950">
      <Toast toast={toast} />
      <header className="bg-gray-900 border-b border-gray-800 px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => router.back()} className="text-gray-400 hover:text-white">
          <ArrowLeft size={20} />
        </button>
        <p className="text-white font-bold truncate">{fornecedor.nome}</p>
        <span className="text-xs bg-purple-900 text-purple-300 px-2 py-0.5 rounded-full ml-auto shrink-0">Fornecedor</span>
      </header>

      <div className="max-w-2xl mx-auto p-4">
        {/* Info */}
        <div className="bg-gray-900 rounded-2xl p-5 mb-4">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <h1 className="text-2xl font-bold text-white">{fornecedor.nome}</h1>
              <span className="inline-block text-xs bg-purple-900 text-purple-300 px-2 py-0.5 rounded-full mt-1">{fornecedor.categoria}</span>
            </div>
            {avaliacoes.length > 0 && (
              <div className="text-right shrink-0">
                <div className="flex items-center gap-1 justify-end">
                  <span className="text-yellow-400 text-lg">★</span>
                  <span className="text-white font-bold">{mediaAval.toFixed(1)}</span>
                </div>
                <p className="text-gray-400 text-xs">{avaliacoes.length} avaliação{avaliacoes.length > 1 ? 'ões' : ''}</p>
              </div>
            )}
          </div>

          {fornecedor.descricao && <p className="text-gray-300 text-sm mb-3">{fornecedor.descricao}</p>}

          <div className="flex flex-col gap-2 text-sm">
            {fornecedor.localizacao && (
              <p className="text-gray-400 flex items-center gap-2"><MapPin size={14} className="text-gray-500" />{fornecedor.localizacao}</p>
            )}
            {fornecedor.instagram && (
              <p className="text-gray-400 flex items-center gap-2"><AtSign size={14} className="text-gray-500" />{fornecedor.instagram}</p>
            )}
          </div>

          <div className="mt-4 flex flex-col gap-2">
            {fornecedor.telefone && (
              <button
                onClick={registrarContato}
                className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 rounded-xl transition flex items-center justify-center gap-2"
              >
                <MessageCircle size={18} />
                Falar no WhatsApp
              </button>
            )}
            {lojaId && !isProprietario && (
              <button
                onClick={() => router.push(`/mensagens/${id}`)}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition flex items-center justify-center gap-2"
              >
                <MessageCircle size={18} />
                Enviar mensagem
              </button>
            )}
            {lojaId && !isProprietario && produtos.length > 0 && (
              <button
                onClick={abrirModalPedido}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-3 rounded-xl transition flex items-center justify-center gap-2"
              >
                <ShoppingCart size={18} />
                Fazer pedido
              </button>
            )}
          </div>
        </div>

        {/* Pedidos feitos pelo comerciante a este fornecedor */}
        {lojaId && !isProprietario && meusPedidos.length > 0 && (
          <div className="bg-gray-900 rounded-2xl p-5 mb-4">
            <h2 className="text-white font-semibold text-lg mb-3 flex items-center gap-2">
              <ShoppingCart size={18} className="text-purple-400" />
              Seus pedidos
            </h2>
            <div className="flex flex-col gap-3">
              {meusPedidos.map(p => (
                <div key={p.id} className="border-b border-gray-800 last:border-0 pb-3 last:pb-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_META[p.status].classes}`}>
                      {STATUS_META[p.status].label}
                    </span>
                    <span className="text-gray-500 text-xs">{new Date(p.created_at).toLocaleDateString('pt-BR')}</span>
                  </div>
                  <p className="text-gray-300 text-sm">
                    {p.itens.map(i => `${i.quantidade}x ${i.nome}`).join(', ')}
                  </p>
                  <p className="text-purple-400 font-bold text-sm mt-1">R$ {p.total.toFixed(2)}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Produtos */}
        {produtos.length > 0 && (
          <div className="mb-4">
            <h2 className="text-white font-semibold text-lg mb-3 flex items-center gap-2">
              <Package size={18} className="text-purple-400" />
              Produtos & Serviços
            </h2>
            <div className="flex flex-col gap-3">
              {produtos.map(p => (
                <div key={p.id} className="bg-gray-900 rounded-2xl p-4 flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-semibold">{p.nome}</p>
                    {p.descricao && <p className="text-gray-400 text-sm mt-0.5">{p.descricao}</p>}
                  </div>
                  <p className="text-purple-400 font-bold shrink-0 ml-4">R$ {parseFloat(p.preco).toFixed(2)}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Avaliar (só para quem não é o proprietário) */}
        {!isProprietario && (
          <div className="bg-gray-900 rounded-2xl p-5 mb-4">
            <h2 className="text-white font-semibold text-lg mb-4">
              {minhaAvaliacao ? 'Sua avaliação' : 'Avaliar este fornecedor'}
            </h2>
            <div className="flex flex-col gap-3">
              <Estrelas nota={nota} onSelect={setNota} />
              <textarea
                placeholder="Deixe um comentário (opcional)"
                value={comentario}
                onChange={e => setComentario(e.target.value)}
                rows={3}
                className="bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-purple-500 resize-none text-sm"
              />
              <button
                onClick={enviarAvaliacao}
                disabled={enviandoAval || nota === 0}
                className="bg-purple-600 hover:bg-purple-700 text-white font-semibold py-3 rounded-xl transition disabled:opacity-50"
              >
                {enviandoAval ? 'Enviando...' : minhaAvaliacao ? 'Atualizar avaliação' : 'Enviar avaliação'}
              </button>
            </div>
          </div>
        )}

        {/* Avaliações */}
        {avaliacoes.length > 0 && (
          <div>
            <h2 className="text-white font-semibold text-lg mb-3">Avaliações ({avaliacoes.length})</h2>
            <div className="flex flex-col gap-3">
              {avaliacoes.map((a, i) => (
                <div key={i} className="bg-gray-900 rounded-2xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Estrelas nota={a.nota} tamanho="text-base" />
                    <span className="text-gray-500 text-xs">{new Date(a.created_at).toLocaleDateString('pt-BR')}</span>
                  </div>
                  {a.comentario && <p className="text-gray-300 text-sm">{a.comentario}</p>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Modal de pedido */}
      {modalPedido && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-end md:items-center justify-center z-50">
          <div className="bg-gray-900 rounded-t-3xl md:rounded-3xl w-full max-w-md max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-gray-800 shrink-0">
              <h2 className="text-xl font-bold text-white">Fazer pedido</h2>
              <button onClick={() => setModalPedido(false)} className="text-gray-400 hover:text-white">
                <X size={22} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-3">
              {produtos.map(p => {
                const qtd = quantidades[p.id] || 0
                return (
                  <div key={p.id} className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-medium truncate">{p.nome}</p>
                      <p className="text-purple-400 text-sm">R$ {parseFloat(p.preco).toFixed(2)}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => ajustarQtd(p.id, -1)}
                        disabled={qtd === 0}
                        className="w-8 h-8 rounded-lg bg-gray-800 text-white flex items-center justify-center disabled:opacity-40 hover:bg-gray-700 transition"
                      >
                        <Minus size={14} />
                      </button>
                      <span className="text-white w-6 text-center text-sm">{qtd}</span>
                      <button
                        onClick={() => ajustarQtd(p.id, 1)}
                        className="w-8 h-8 rounded-lg bg-purple-600 text-white flex items-center justify-center hover:bg-purple-700 transition"
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  </div>
                )
              })}

              <textarea
                placeholder="Observação (opcional)"
                value={observacao}
                onChange={e => setObservacao(e.target.value)}
                rows={2}
                className="bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-purple-500 resize-none text-sm mt-2"
              />
            </div>

            <div className="p-5 border-t border-gray-800 shrink-0">
              <div className="flex items-center justify-between mb-3">
                <span className="text-gray-400 text-sm">{itensSelecionados.length} item(ns)</span>
                <span className="text-white font-bold text-lg">R$ {totalPedido.toFixed(2)}</span>
              </div>
              <button
                onClick={enviarPedido}
                disabled={enviandoPedido || itensSelecionados.length === 0}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-3 rounded-xl transition disabled:opacity-50"
              >
                {enviandoPedido ? 'Enviando...' : 'Enviar pedido'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
