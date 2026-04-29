'use client'
import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useCliente } from '../../../hooks/useCliente'
import { Estrelas } from '../../../components/Estrelas'
import { useToast } from '../../../hooks/useToast'
import { Toast } from '../../../components/Toast'
import { Phone, AtSign, MapPin, Clock, MessageCircle, ArrowLeft } from 'lucide-react'

export default function ClienteLoja() {
  const { id } = useParams<{ id: string }>()
  const { cliente, loading, supabase } = useCliente()
  const { toast, mostrarToast } = useToast()
  const [loja, setLoja] = useState<any>(null)
  const [produtos, setProdutos] = useState<any[]>([])
  const [avaliacoes, setAvaliacoes] = useState<any[]>([])
  const [mediaAval, setMediaAval] = useState(0)
  const [minhaAvaliacao, setMinhaAvaliacao] = useState<any>(null)
  const [nota, setNota] = useState(0)
  const [comentario, setComentario] = useState('')
  const [enviandoAval, setEnviandoAval] = useState(false)
  const router = useRouter()

  useEffect(() => {
    if (cliente && id) carregarLoja()
  }, [cliente, id])

  async function carregarLoja() {
    const [lojaRes, prodRes, avalRes] = await Promise.all([
      supabase.from('lojas').select('id, nome, tipo, localizacao, telefone, instagram, horario').eq('id', id).single(),
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

  if (loading || !loja) return (
    <main className="min-h-screen bg-gray-950 flex items-center justify-center">
      <p className="text-gray-400">Carregando...</p>
    </main>
  )

  return (
    <main className="min-h-screen bg-gray-950">
      <Toast toast={toast} />
      <header className="bg-gray-900 border-b border-gray-800 px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => router.push('/cliente/buscar')} className="text-gray-400 hover:text-white">
          <ArrowLeft size={20} />
        </button>
        <p className="text-white font-bold truncate">{loja.nome}</p>
      </header>

      <div className="max-w-2xl mx-auto p-4">
        {/* Info da loja */}
        <div className="bg-gray-900 rounded-2xl p-5 mb-4">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <h1 className="text-2xl font-bold text-white">{loja.nome}</h1>
              <span className="inline-block text-xs bg-gray-800 text-gray-300 px-2 py-0.5 rounded-full mt-1">{loja.tipo}</span>
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

          {loja.telefone && (
            <button
              onClick={abrirWhatsApp}
              className="mt-4 w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 rounded-xl transition flex items-center justify-center gap-2"
            >
              <MessageCircle size={18} />
              Falar no WhatsApp
            </button>
          )}
        </div>

        {/* Produtos */}
        {produtos.length > 0 && (
          <div className="mb-4">
            <h2 className="text-white font-semibold text-lg mb-3">Produtos disponíveis</h2>
            <div className="grid grid-cols-2 gap-3">
              {produtos.map(p => (
                <div key={p.id} className="bg-gray-900 rounded-2xl overflow-hidden">
                  {p.imagem_url ? (
                    <img src={p.imagem_url} alt={p.nome} className="w-full h-32 object-cover" />
                  ) : (
                    <div className="w-full h-32 bg-gray-800 flex items-center justify-center text-3xl">📦</div>
                  )}
                  <div className="p-3">
                    <p className="text-white font-medium text-sm">{p.nome}</p>
                    {p.categoria && <p className="text-gray-500 text-xs">{p.categoria}</p>}
                    <p className="text-green-400 font-bold mt-1">R$ {parseFloat(p.preco_venda).toFixed(2)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Avaliar */}
        <div className="bg-gray-900 rounded-2xl p-5 mb-4">
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
    </main>
  )
}
