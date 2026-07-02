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
import { emojiNicho } from '../../../lib/temaLoja'
import { Phone, AtSign, MapPin, Clock, MessageCircle, ArrowLeft, Heart } from 'lucide-react'

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
      supabase.from('lojas_publicas').select('id, nome, tipo, localizacao, telefone, instagram, horario, latitude, longitude, fotos_fachada').eq('id', id).single(),
      supabase.from('produtos').select('id, nome, preco_venda, imagem_url, categoria').eq('loja_id', id).gt('quantidade', 0),
      supabase.from('avaliacoes_lojas').select('nota, comentario, created_at, cliente_id').eq('loja_id', id).order('created_at', { ascending: false }),
    ])

    if (lojaRes.error || !lojaRes.data) { router.push('/cliente/buscar'); return }
    setLoja(lojaRes.data)
    setProdutos(prodRes.data || [])

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
      <header className="bg-gray-900 border-b border-gray-800 px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => router.push('/cliente/buscar')} className="shrink-0 text-gray-400 hover:text-white">
          <ArrowLeft size={20} />
        </button>
        <p className="text-white font-bold truncate flex-1 min-w-0">{loja.nome}</p>
        <button
          onClick={alternarFavorito}
          aria-label={favorito ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
          className={`shrink-0 p-2 rounded-full transition ${favorito ? 'bg-red-500/15 hover:bg-red-500/25' : 'hover:bg-gray-800'}`}
        >
          <Heart size={20} className={favorito ? 'fill-red-500 text-red-500' : 'text-gray-400'} />
        </button>
      </header>

      <div className="max-w-2xl mx-auto p-4">
        <FachadaBanner fotos={loja.fotos_fachada} nome={loja.nome} tipo={loja.tipo} />

        <div className="bg-gradient-to-b from-gray-900 to-gray-900/60 border border-gray-800 rounded-2xl p-5 mb-4">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-2xl shrink-0">{emojiNicho(loja.tipo)}</span>
                <h1 className="text-2xl font-bold text-white truncate">{loja.nome}</h1>
              </div>
              <span className="inline-block text-xs bg-gray-800 text-gray-300 px-2 py-0.5 rounded-full mt-1">{loja.tipo}</span>
            </div>
            {avaliacoes.length > 0 && <RatingBadge media={mediaAval} total={avaliacoes.length} />}
          </div>

          <div className="flex flex-col gap-2 text-sm">
            {loja.localizacao && (
              <p className="text-gray-400 flex items-center gap-2"><MapPin size={14} className="text-gray-500" />{loja.localizacao}</p>
            )}
            {loja.horario && (
              <p className="text-gray-400 flex items-center gap-2"><Clock size={14} className="text-gray-500" />{loja.horario}</p>
            )}
            {loja.instagram && (
              <p className="text-gray-400 flex items-center gap-2"><AtSign size={14} className="text-gray-500" />{loja.instagram}</p>
            )}
          </div>

          <div className="mt-4 flex gap-2">
            <button
              onClick={() => router.push(`/cliente/mensagens/${id}`)}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition flex items-center justify-center gap-2"
            >
              <MessageCircle size={18} />
              Mensagem
            </button>
            {loja.telefone && (
              <button
                onClick={abrirWhatsApp}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold py-3 rounded-xl transition flex items-center justify-center gap-2"
              >
                <Phone size={18} />
                WhatsApp
              </button>
            )}
          </div>
        </div>

        <MiniMapa latitude={loja.latitude} longitude={loja.longitude} localizacao={loja.localizacao} nome={loja.nome} />

        {produtos.length > 0 && (
          <div className="bg-gray-900/40 border border-gray-800 rounded-2xl p-4 mb-4">
            <h2 className="text-white font-semibold text-lg mb-3">Produtos disponíveis</h2>
            <div className="grid grid-cols-2 gap-3">
              {produtos.map(p => <ProdutoCard key={p.id} produto={p} tipoLoja={loja.tipo} />)}
            </div>
          </div>
        )}

        <div className="bg-gray-900 border border-green-900/30 rounded-2xl p-5 mb-4">
          <h2 className="text-white font-semibold text-lg mb-4">
            {minhaAvaliacao ? 'Sua avaliação' : 'Avaliar este comércio'}
          </h2>
          <div className="flex flex-col gap-3">
            <Estrelas nota={nota} onSelect={setNota} />
            <textarea
              placeholder="Deixe um comentário (opcional)"
              value={comentario}
              onChange={e => setComentario(e.target.value)}
              rows={3}
              className="bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-green-500 resize-none text-sm"
            />
            <button
              onClick={enviarAvaliacao}
              disabled={enviandoAval || nota === 0}
              className="bg-green-600 hover:bg-green-700 text-white font-semibold py-3 rounded-xl transition disabled:opacity-50"
            >
              {enviandoAval ? 'Enviando...' : minhaAvaliacao ? 'Atualizar avaliação' : 'Enviar avaliação'}
            </button>
          </div>
        </div>

        {avaliacoes.length > 0 && (
          <div>
            <h2 className="text-white font-semibold text-lg mb-3">Avaliações ({avaliacoes.length})</h2>
            <div className="flex flex-col gap-3">
              {avaliacoes.map((a, i) => (
                <div key={i} className="bg-gray-900/60 border border-gray-800 rounded-2xl p-4">
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
    </ClienteLayout>
  )
}
