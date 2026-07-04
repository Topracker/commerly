'use client'
import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useCliente } from '../../../hooks/useCliente'
import { ClienteLayout } from '../../../components/ClienteLayout'
import { Estrelas } from '../../../components/Estrelas'
import { useToast } from '../../../hooks/useToast'
import { Toast } from '../../../components/Toast'
import { isFavorito, toggleFavorito } from '../../../lib/favoritos'
import { MiniMapa } from '../../../components/MiniMapa'
import { FachadaBanner } from '../../../components/FachadaBanner'
import { RatingBadge } from '../../../components/RatingBadge'
import { ProdutoCard } from '../../../components/ProdutoCard'
import { PedidoModal } from '../../../components/PedidoModal'
import { isDelivery } from '../../../lib/pedidosClientes'
import { Phone, AtSign, MapPin, Clock, MessageCircle, ArrowLeft, Heart, ShoppingBag, Globe } from 'lucide-react'

export default function ClienteLoja() {
  const { id } = useParams<{ id: string }>()
  const { cliente, loading, supabase, sair } = useCliente()
  const { toast, mostrarToast } = useToast()
  const [loja, setLoja] = useState<any>(null)
  const [produtos, setProdutos] = useState<any[]>([])
  const [avaliacoes, setAvaliacoes] = useState<any[]>([])
  const [mediaAval, setMediaAval] = useState(0)
  const [minhaAvaliacao, setMinhaAvaliacao] = useState<any>(null)
  const [nota, setNota] = useState(0)
  const [comentario, setComentario] = useState('')
  const [enviandoAval, setEnviandoAval] = useState(false)
  const [favorito, setFavorito] = useState(false)
  const [pedidoAberto, setPedidoAberto] = useState(false)
  const router = useRouter()

  useEffect(() => {
    if (cliente && id) carregarLoja()
  }, [cliente, id])

  useEffect(() => {
    if (id) setFavorito(isFavorito(id))
  }, [id])

  function alternarFavorito() {
    if (!loja) return
    const agora = toggleFavorito({ id: loja.id, nome: loja.nome, tipo: loja.tipo })
    setFavorito(agora)
    mostrarToast(agora ? 'Loja adicionada aos favoritos!' : 'Removida dos favoritos', 'sucesso')
  }

  async function carregarLoja() {
    const [lojaRes, prodRes, avalRes] = await Promise.all([
      supabase.from('lojas_publicas').select('id, nome, tipo, localizacao, telefone, instagram, horario, latitude, longitude, fotos_fachada, taxa_entrega, website_url').eq('id', id).single(),
      supabase.from('produtos').select('id, nome, preco_venda, imagem_url, categoria').eq('loja_id', id).gt('quantidade', 0),
      supabase.from('avaliacoes_lojas').select('nota, comentario, created_at, cliente_id').eq('loja_id', id).order('created_at', { ascending: false }),
    ])

    if (lojaRes.error || !lojaRes.data) { router.push('/cliente/buscar'); return }
    setLoja(lojaRes.data)
    setProdutos(prodRes.data || [])

    // Distância máxima da loja em separado e tolerante: a coluna da view pode
    // não existir (pré-migração) — nesse caso o modal não bloqueia no cliente
    // (o trigger continua sendo a barreira definitiva no servidor).
    supabase.from('lojas_publicas').select('distancia_maxima_entrega').eq('id', id).maybeSingle()
      .then(({ data }: any) => {
        if (data?.distancia_maxima_entrega != null) {
          setLoja((prev: any) => (prev ? { ...prev, distancia_maxima_entrega: Number(data.distancia_maxima_entrega) } : prev))
        }
      })

    const avals = avalRes.data || []
    setAvaliacoes(avals)
    if (avals.length > 0) setMediaAval(avals.reduce((s: number, a: any) => s + a.nota, 0) / avals.length)

    const minha = avals.find((a: any) => a.cliente_id === cliente.id)
    if (minha) { setMinhaAvaliacao(minha); setNota(minha.nota); setComentario(minha.comentario || '') }
  }

  async function enviarAvaliacao() {
    if (nota === 0) { mostrarToast('Selecione uma nota!', 'erro'); return }
    setEnviandoAval(true)
    const payload = { cliente_id: cliente.id, loja_id: id, nota, comentario }
    const { error } = minhaAvaliacao
      ? await supabase.from('avaliacoes_lojas').update({ nota, comentario }).eq('cliente_id', cliente.id).eq('loja_id', id)
      : await supabase.from('avaliacoes_lojas').insert(payload)
    if (error) { mostrarToast('Erro ao enviar avaliação', 'erro'); setEnviandoAval(false); return }
    mostrarToast(minhaAvaliacao ? 'Avaliação atualizada!' : 'Avaliação enviada!', 'sucesso')
    setEnviandoAval(false)
    carregarLoja()
  }

  function abrirWhatsApp() {
    if (!loja?.telefone) return
    const num = loja.telefone.replace(/\D/g, '')
    window.open(`https://wa.me/55${num}?text=Olá! Vi seu comércio no Commerly.`, '_blank')
  }

  if (loading) return (
    <main className="min-h-screen bg-gray-950 flex items-center justify-center">
      <p className="text-gray-400">Carregando...</p>
    </main>
  )
  if (!cliente) return null

  if (!loja) return (
    <ClienteLayout cliente={cliente} sair={sair}>
      <div className="flex items-center justify-center py-24">
        <p className="text-gray-400">Carregando...</p>
      </div>
    </ClienteLayout>
  )

  return (
    <ClienteLayout cliente={cliente} sair={sair} noPadding>
      <Toast toast={toast} />
      <header className="bg-[#12161B] border-b border-[#232A32] px-4 py-3 flex items-center gap-3 sticky top-0 z-20">
        <button onClick={() => router.push('/cliente/buscar')} className="shrink-0 text-gray-400 hover:text-white">
          <ArrowLeft size={20} />
        </button>
        <p className="font-display text-white font-bold truncate flex-1 min-w-0">{loja.nome}</p>
      </header>

      <div className="max-w-2xl mx-auto px-4 pt-4 pb-10 font-body">
        <FachadaBanner fotos={loja.fotos_fachada} nome={loja.nome} tipo={loja.tipo} />

        <div className="relative z-10 -mt-10 space-y-[18px]">
          {/* Card de info — sobrepõe o banner */}
          <div className="bg-[#12161B] border border-[#232A32] rounded-2xl p-5">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="min-w-0">
                <h1 className="font-display text-2xl font-bold text-white truncate">{loja.nome}</h1>
                <span className="inline-block text-xs bg-[#1B2129] border border-[#232A32] text-gray-300 px-2.5 py-0.5 rounded-full mt-1.5">{loja.tipo}</span>
              </div>
              {avaliacoes.length > 0 && <RatingBadge media={mediaAval} total={avaliacoes.length} />}
            </div>

            <div className="flex flex-col gap-2 text-sm">
              {loja.localizacao && (
                <p className="text-gray-400 flex items-center gap-2.5"><MapPin size={15} className="text-gray-500 shrink-0" />{loja.localizacao}</p>
              )}
              {loja.horario && (
                <p className="text-gray-400 flex items-center gap-2.5"><Clock size={15} className="text-gray-500 shrink-0" />{loja.horario}</p>
              )}
              {loja.instagram && (
                <p className="text-gray-400 flex items-center gap-2.5"><AtSign size={15} className="text-gray-500 shrink-0" />{loja.instagram}</p>
              )}
            </div>

            <div className="mt-4 flex items-center gap-2">
              {loja.telefone && (
                <button
                  onClick={abrirWhatsApp}
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold py-3 rounded-xl transition flex items-center justify-center gap-2"
                >
                  <Phone size={18} />
                  WhatsApp
                </button>
              )}
              <button
                onClick={() => router.push(`/cliente/mensagens/${id}`)}
                className="flex-1 bg-[#1B2129] border border-[#232A32] hover:bg-[#232A32] text-white font-semibold py-3 rounded-xl transition flex items-center justify-center gap-2"
              >
                <MessageCircle size={18} />
                Mensagem
              </button>
              <button
                onClick={alternarFavorito}
                aria-label={favorito ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
                className={`shrink-0 w-12 h-12 flex items-center justify-center rounded-xl border transition ${
                  favorito
                    ? 'bg-red-500/15 border-red-500/40 hover:bg-red-500/25'
                    : 'bg-[#1B2129] border-[#232A32] hover:bg-[#232A32]'
                }`}
              >
                <Heart size={20} className={favorito ? 'fill-red-500 text-red-500' : 'text-gray-400'} />
              </button>
            </div>

            {isDelivery(loja.tipo) && produtos.length > 0 && (
              <button
                onClick={() => setPedidoAberto(true)}
                className="mt-2.5 w-full bg-[#C1441E] hover:bg-[#a83a19] text-white font-semibold py-3 rounded-xl transition flex items-center justify-center gap-2"
              >
                <ShoppingBag size={18} />
                Fazer Pedido
              </button>
            )}

            {loja.website_url && (
              <a
                href={loja.website_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2.5 w-full bg-[#1B2129] border border-[#232A32] hover:bg-[#232A32] text-white font-semibold py-3 rounded-xl transition flex items-center justify-center gap-2"
              >
                <Globe size={18} />
                Visitar site
              </a>
            )}
          </div>

          <MiniMapa latitude={loja.latitude} longitude={loja.longitude} localizacao={loja.localizacao} nome={loja.nome} />

          {produtos.length > 0 && (
            <div className="bg-[#12161B] border border-[#232A32] rounded-2xl p-4">
              <h2 className="font-display text-white font-semibold text-lg mb-3">
                Produtos disponíveis <span className="text-gray-500 font-normal text-sm">({produtos.length})</span>
              </h2>
              <div className="grid grid-cols-2 gap-3">
                {produtos.map(p => <ProdutoCard key={p.id} produto={p} tipoLoja={loja.tipo} />)}
              </div>
            </div>
          )}

          <div className="bg-[#12161B] border border-[#232A32] rounded-2xl p-5">
            <h2 className="font-display text-white font-semibold text-lg mb-4">
              {minhaAvaliacao ? 'Sua avaliação' : 'Avaliar este comércio'}
            </h2>
            <div className="flex flex-col gap-3">
              <Estrelas nota={nota} onSelect={setNota} />
              <textarea
                placeholder="Deixe um comentário (opcional)"
                value={comentario}
                onChange={e => setComentario(e.target.value)}
                rows={3}
                className="bg-[#171C22] border border-[#232A32] text-white rounded-xl px-4 py-3 outline-none focus:border-[#F5C34B]/60 focus:ring-1 focus:ring-[#F5C34B]/40 resize-none text-sm"
              />
              <button
                onClick={enviarAvaliacao}
                disabled={enviandoAval || nota === 0}
                className={`font-semibold py-3 rounded-xl transition disabled:opacity-50 ${
                  minhaAvaliacao
                    ? 'bg-[#F5C34B] hover:bg-[#e6b43e] text-[#12161B]'
                    : 'bg-green-600 hover:bg-green-700 text-white'
                }`}
              >
                {enviandoAval ? 'Enviando...' : minhaAvaliacao ? 'Atualizar avaliação' : 'Enviar avaliação'}
              </button>
            </div>
          </div>

          {avaliacoes.length > 0 && (
            <div className="bg-[#12161B] border border-[#232A32] rounded-2xl p-5">
              <h2 className="font-display text-white font-semibold text-lg mb-2">Avaliações ({avaliacoes.length})</h2>
              <div className="divide-y divide-[#232A32]">
                {avaliacoes.map((a, i) => (
                  <div key={i} className="py-3">
                    <div className="flex items-center justify-between gap-2">
                      <Estrelas nota={a.nota} tamanho="text-base" />
                      <span className="text-gray-500 text-xs shrink-0">{new Date(a.created_at).toLocaleDateString('pt-BR')}</span>
                    </div>
                    {a.comentario && <p className="text-gray-300 text-sm mt-1.5">{a.comentario}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {pedidoAberto && (
        <PedidoModal
          loja={loja}
          cliente={cliente}
          produtos={produtos}
          supabase={supabase}
          onFechar={() => setPedidoAberto(false)}
          onSucesso={(msg) => mostrarToast(msg, 'sucesso')}
          onErro={(msg) => mostrarToast(msg, 'erro')}
        />
      )}
    </ClienteLayout>
  )
}
