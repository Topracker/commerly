'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Heart, MessageCircle, Share2, ShoppingBag, Store, Send } from 'lucide-react'
import { tempoDoPost, type Post, type LojaDoFeed, type ProdutoMarcado } from '../lib/feed'

export type Comentario = {
  id: string
  cliente_id: string
  texto: string
  created_at: string
  cliente_nome?: string | null
}

type Props = {
  post: Post
  loja?: LojaDoFeed
  produto?: ProdutoMarcado
  curtido: boolean
  likes: number
  comentarios: Comentario[]
  onCurtir: () => void
  onComentar: (texto: string) => Promise<void>
  onPedir: () => void
  /** Dispara uma vez, quando o post aparece na tela. */
  onVisualizar: () => void
}

const reais = (v: number) => `R$ ${Number(v).toFixed(2).replace('.', ',')}`

export function PostCard({
  post, loja, produto, curtido, likes, comentarios, onCurtir, onComentar, onPedir, onVisualizar,
}: Props) {
  const [abrirComentarios, setAbrirComentarios] = useState(false)
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [copiado, setCopiado] = useState(false)
  const ref = useRef<HTMLElement | null>(null)
  const jaContou = useRef(false)
  const router = useRouter()

  // Visualização = o post entrou na tela. Conta uma vez por montagem; o índice
  // único no banco garante um evento por cliente/post de qualquer forma.
  useEffect(() => {
    const el = ref.current
    if (!el || jaContou.current) return
    const obs = new IntersectionObserver(
      entradas => {
        if (entradas[0]?.isIntersecting && !jaContou.current) {
          jaContou.current = true
          onVisualizar()
          obs.disconnect()
        }
      },
      { threshold: 0.5 },
    )
    obs.observe(el)
    return () => obs.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post.id])

  async function enviarComentario() {
    const t = texto.trim()
    if (!t || enviando) return
    setEnviando(true)
    await onComentar(t)
    setTexto('')
    setEnviando(false)
  }

  async function compartilhar() {
    const url = `${window.location.origin}/loja/${post.loja_id}`
    const dados = { title: loja?.nome || 'Commerly', text: post.legenda || 'Olha isso!', url }
    // navigator.share só existe em HTTPS/mobile; no desktop cai no clipboard.
    if (navigator.share) {
      try { await navigator.share(dados); return } catch { /* usuário cancelou */ }
    }
    try {
      await navigator.clipboard.writeText(url)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch { /* sem clipboard: nada a fazer */ }
  }

  const fachada = loja?.fotos_fachada?.[0]

  return (
    <article ref={ref} className="bg-[#12161B] border border-[#232A32] rounded-2xl overflow-hidden">
      <header className="flex items-center gap-3 p-3">
        <button
          onClick={() => router.push(`/cliente/loja/${post.loja_id}`)}
          className="w-10 h-10 rounded-full overflow-hidden bg-[#1B2129] flex items-center justify-center shrink-0"
        >
          {fachada
            ? <img src={fachada} alt="" className="w-full h-full object-cover" />
            : <Store size={16} className="text-gray-400" />}
        </button>
        <div className="flex-1 min-w-0">
          <button onClick={() => router.push(`/cliente/loja/${post.loja_id}`)} className="block text-left">
            <p className="text-white font-semibold text-sm truncate">{loja?.nome || 'Loja'}</p>
          </button>
          <p className="text-gray-500 text-xs">{tempoDoPost(post.created_at)}</p>
        </div>
      </header>

      {post.tipo === 'video' ? (
        <video
          src={post.midia_url}
          className="w-full max-h-[70vh] bg-black object-contain"
          controls
          playsInline
          preload="metadata"
        />
      ) : (
        <img src={post.midia_url} alt={post.legenda || ''} className="w-full max-h-[70vh] object-cover bg-black" />
      )}

      <div className="p-3">
        <div className="flex items-center gap-4 mb-2">
          <button onClick={onCurtir} className="flex items-center gap-1.5 group" aria-pressed={curtido}>
            <Heart
              size={20}
              className={curtido ? 'fill-red-500 text-red-500' : 'text-gray-400 group-hover:text-red-400'}
            />
            <span className={`text-sm ${curtido ? 'text-red-400' : 'text-gray-400'}`}>{likes}</span>
          </button>
          <button onClick={() => setAbrirComentarios(v => !v)} className="flex items-center gap-1.5 text-gray-400 hover:text-white">
            <MessageCircle size={20} />
            <span className="text-sm">{comentarios.length}</span>
          </button>
          <button onClick={compartilhar} className="text-gray-400 hover:text-white ml-auto flex items-center gap-1.5">
            <Share2 size={19} />
            {copiado && <span className="text-xs text-green-400">Link copiado!</span>}
          </button>
        </div>

        {post.legenda && (
          <p className="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap mb-2">{post.legenda}</p>
        )}

        {produto && (
          <div className="flex items-center justify-between gap-3 bg-[#171C22] border border-[#232A32] rounded-xl px-3 py-2 mb-2">
            <div className="min-w-0">
              <p className="text-white text-sm font-medium truncate">{produto.nome}</p>
              <p className="text-[#6FD98F] text-sm font-bold">{reais(produto.preco_venda)}</p>
            </div>
          </div>
        )}

        <button
          onClick={onPedir}
          className="w-full bg-[#C1441E] hover:bg-[#a83a19] text-white font-semibold py-2.5 rounded-xl transition text-sm flex items-center justify-center gap-2"
        >
          <ShoppingBag size={17} />
          Pedir agora
        </button>

        {abrirComentarios && (
          <div className="mt-3 pt-3 border-t border-[#232A32]">
            {comentarios.length === 0 ? (
              <p className="text-gray-500 text-xs mb-2">Ninguém comentou ainda. Seja o primeiro.</p>
            ) : (
              <div className="flex flex-col gap-2 mb-3 max-h-52 overflow-y-auto">
                {comentarios.map(c => (
                  <div key={c.id}>
                    <p className="text-gray-300 text-sm">
                      <span className="text-white font-medium">{c.cliente_nome || 'Cliente'}</span>{' '}
                      {c.texto}
                    </p>
                    <p className="text-gray-600 text-[11px]">{tempoDoPost(c.created_at)}</p>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input
                value={texto}
                onChange={e => setTexto(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') enviarComentario() }}
                maxLength={500}
                placeholder="Escreva um comentário..."
                className="flex-1 bg-[#171C22] border border-[#232A32] text-white text-sm rounded-xl px-3 py-2 outline-none focus:border-[#C1441E]/60"
              />
              <button
                onClick={enviarComentario}
                disabled={!texto.trim() || enviando}
                className="shrink-0 bg-[#C1441E] hover:bg-[#a83a19] disabled:opacity-40 text-white px-3 rounded-xl transition"
              >
                <Send size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </article>
  )
}
