'use client'
import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '../../supabase'
import { Estrelas } from '../../components/Estrelas'
import { useToast } from '../../hooks/useToast'
import { Toast } from '../../components/Toast'
import { Phone, AtSign, MapPin, MessageCircle, ArrowLeft, Package } from 'lucide-react'

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
  const [carregando, setCarregando] = useState(true)
  const viewRegistered = useRef(false)
  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    if (id) carregar()
  }, [id])

  async function carregar() {
    setCarregando(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/'); return }
    setUserId(user.id)

    const [fornRes, prodRes, avalRes] = await Promise.all([
      supabase.from('fornecedores').select('*').eq('id', id).single(),
      supabase.from('fornecedor_produtos').select('*').eq('fornecedor_id', id).order('created_at', { ascending: false }),
      supabase.from('avaliacoes_fornecedores').select('nota, comentario, created_at, user_id').eq('fornecedor_id', id).order('created_at', { ascending: false }),
    ])

    if (fornRes.error || !fornRes.data) { router.push('/'); return }
    setFornecedor(fornRes.data)
    setProdutos(prodRes.data || [])

    const avals = avalRes.data || []
    setAvaliacoes(avals)
    if (avals.length > 0) setMediaAval(avals.reduce((s: number, a: any) => s + a.nota, 0) / avals.length)

    const minha = avals.find((a: any) => a.user_id === user.id)
    if (minha) { setMinhaAvaliacao(minha); setNota(minha.nota); setComentario(minha.comentario || '') }

    // Registrar visualização (apenas uma vez por carregamento)
    if (!viewRegistered.current && fornRes.data.user_id !== user.id) {
      viewRegistered.current = true
      await supabase.from('visualizacoes_fornecedor').insert({ fornecedor_id: id, user_id: user.id })
    }

    setCarregando(false)
  }

  async function enviarAvaliacao() {
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

          {fornecedor.telefone && (
            <button
              onClick={registrarContato}
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
    </main>
  )
}
