'use client'
import { useEffect, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import { AppLayout } from '../components/AppLayout'
import { Toast } from '../components/Toast'
import {
  STORY_HORAS, erroMidia, tempoDoPost, tipoDaMidia, uploadMidiaFeed,
  type Post, type Story, type TipoMidia,
} from '../lib/feed'
import { Image as ImageIcon, Film, Trash2, Eye, Heart, MessageCircle, ShoppingBag, Clock } from 'lucide-react'
import { SeletorMidiaFeed } from '../components/SeletorMidiaFeed'

type Produto = { id: string; nome: string; preco_venda: number }
type Metrica = { post_id: string; likes: number; comentarios: number; visualizacoes: number; cliques_pedir: number }

const reais = (v: number) => `R$ ${Number(v).toFixed(2).replace('.', ',')}`

export default function PostsDaLoja() {
  const { loja, loading, supabase, sair } = useAuth()
  const { toast, mostrarToast } = useToast()

  const [modo, setModo] = useState<'post' | 'story'>('post')
  const [arquivo, setArquivo] = useState<{ file: File; preview: string; tipo: TipoMidia } | null>(null)
  const [legenda, setLegenda] = useState('')
  const [produtoId, setProdutoId] = useState('')
  const [publicando, setPublicando] = useState(false)

  const [posts, setPosts] = useState<Post[]>([])
  const [stories, setStories] = useState<Story[]>([])
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [metricas, setMetricas] = useState<Record<string, Metrica>>({})
  const [seguidores, setSeguidores] = useState(0)
  const [carregando, setCarregando] = useState(true)

  useEffect(() => { if (loja) carregar() }, [loja])

  async function carregar() {
    const agora = new Date().toISOString()
    const [postsRes, storiesRes, produtosRes, metricasRes, seguidoresRes] = await Promise.all([
      supabase.from('posts').select('*').eq('loja_id', loja.id).order('created_at', { ascending: false }),
      supabase.from('stories').select('*').eq('loja_id', loja.id).gt('expira_em', agora).order('created_at', { ascending: false }),
      supabase.from('produtos').select('id, nome, preco_venda').eq('loja_id', loja.id).order('nome'),
      supabase.from('posts_metricas').select('*').eq('loja_id', loja.id),
      supabase.from('loja_seguidores').select('id', { count: 'exact', head: true }).eq('loja_id', loja.id),
    ])
    setPosts((postsRes.data || []) as Post[])
    setStories((storiesRes.data || []) as Story[])
    setProdutos((produtosRes.data || []) as Produto[])
    setMetricas(Object.fromEntries(((metricasRes.data || []) as Metrica[]).map(m => [m.post_id, m])))
    setSeguidores(seguidoresRes.count || 0)
    setCarregando(false)
  }

  function selecionar(file: File | undefined) {
    if (!file) return
    const erro = erroMidia(file)
    if (erro) { mostrarToast(erro, 'erro'); return }
    if (arquivo) URL.revokeObjectURL(arquivo.preview)
    setArquivo({ file, preview: URL.createObjectURL(file), tipo: tipoDaMidia(file)! })
  }

  /** Só a mídia — o ✕ do preview não pode apagar a legenda já escrita. */
  function limparMidia() {
    if (arquivo) URL.revokeObjectURL(arquivo.preview)
    setArquivo(null)
  }

  function limpar() {
    limparMidia()
    setLegenda('')
    setProdutoId('')
  }

  async function publicar() {
    if (!arquivo) { mostrarToast('Escolha uma foto ou um vídeo.', 'erro'); return }
    setPublicando(true)

    const up = await uploadMidiaFeed(supabase, loja.id, arquivo.file)
    if ('error' in up) { mostrarToast(up.error, 'erro'); setPublicando(false); return }

    const base = {
      loja_id: loja.id,
      tipo: up.tipo,
      midia_url: up.url,
      produto_id: produtoId || null,
    }
    const { error } = modo === 'post'
      ? await supabase.from('posts').insert({ ...base, legenda: legenda.trim() || null })
      : await supabase.from('stories').insert(base)

    setPublicando(false)
    if (error) { mostrarToast('Não foi possível publicar. Tente de novo.', 'erro'); return }

    mostrarToast(
      modo === 'post'
        ? (seguidores > 0 ? `Post publicado! ${seguidores} seguidor${seguidores > 1 ? 'es' : ''} foi notificado.` : 'Post publicado!')
        : `Story publicado! Some em ${STORY_HORAS}h.`,
      'sucesso',
    )
    limpar()
    carregar()
  }

  async function apagar(tabela: 'posts' | 'stories', id: string) {
    const { error } = await supabase.from(tabela).delete().eq('id', id)
    if (error) { mostrarToast('Não foi possível apagar.', 'erro'); return }
    mostrarToast(tabela === 'posts' ? 'Post apagado.' : 'Story apagado.', 'sucesso')
    carregar()
  }

  if (loading) return null
  if (!loja) return null

  const nomeProduto = (id: string | null) => produtos.find(p => p.id === id)?.nome

  return (
    <AppLayout loja={loja} sair={sair} titulo="Feed da loja">
      <Toast toast={toast} />

      {/* Criar */}
      <div className="bg-card border border-borda rounded-2xl p-5 mb-6">
        <div className="flex gap-2 mb-4">
          {(['post', 'story'] as const).map(m => (
            <button
              key={m}
              onClick={() => setModo(m)}
              className={`px-3.5 py-2 rounded-xl text-sm font-semibold transition ${modo === m ? 'bg-azul text-white' : 'bg-elevado text-gray-400 hover:text-white'}`}
            >
              {m === 'post' ? 'Criar post' : 'Criar story'}
            </button>
          ))}
          <span className="ml-auto self-center text-gray-500 text-xs">
            {seguidores} seguidor{seguidores === 1 ? '' : 'es'}
          </span>
        </div>

        <p className="text-gray-500 text-xs mb-3">
          {modo === 'post'
            ? 'O post fica no feed e notifica quem segue a sua loja.'
            : `O story aparece no topo do feed e some em ${STORY_HORAS} horas.`}
        </p>

        <SeletorMidiaFeed midia={arquivo} onSelecionar={selecionar} onLimpar={limparMidia} />

        {modo === 'post' && (
          <textarea
            value={legenda}
            onChange={e => setLegenda(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder="Escreva uma legenda (opcional)"
            className="mt-3 w-full bg-superficie border border-borda text-white text-sm rounded-xl px-3 py-2.5 outline-none focus:border-acento/60 resize-none"
          />
        )}

        {produtos.length > 0 && (
          <div className="mt-3">
            <label className="block text-gray-400 text-xs mb-1.5">
              Marcar produto do cardápio (habilita &quot;Pedir {modo === 'post' ? 'agora' : 'este item'}&quot;)
            </label>
            <select
              value={produtoId}
              onChange={e => setProdutoId(e.target.value)}
              className="w-full bg-superficie border border-borda text-white text-sm rounded-xl px-3 py-2.5 outline-none focus:border-acento/60"
            >
              <option value="">Nenhum produto</option>
              {produtos.map(p => (
                <option key={p.id} value={p.id}>{p.nome} — {reais(p.preco_venda)}</option>
              ))}
            </select>
          </div>
        )}

        <div className="flex gap-2 mt-4">
          <button
            onClick={publicar}
            disabled={publicando || !arquivo}
            className="flex-1 bg-azul hover:bg-azul/85 disabled:opacity-40 text-white font-semibold py-2.5 rounded-xl transition text-sm"
          >
            {publicando ? 'Publicando...' : modo === 'post' ? 'Publicar post' : 'Publicar story'}
          </button>
          {arquivo && (
            <button onClick={limpar} className="px-4 bg-elevado hover:bg-superficie text-gray-300 rounded-xl text-sm transition">
              Limpar
            </button>
          )}
        </div>
      </div>

      {carregando ? (
        <p className="text-gray-500 text-sm">Carregando...</p>
      ) : (
        <div className="flex flex-col gap-6">
          {/* Stories ativos */}
          <section>
            <h2 className="text-white font-semibold mb-2 flex items-center gap-2">
              <Clock size={16} className="text-amber-400" /> Stories ativos
              <span className="text-gray-500 text-xs font-normal">({stories.length})</span>
            </h2>
            {stories.length === 0 ? (
              <p className="text-gray-500 text-sm">Nenhum story no ar. Eles somem {STORY_HORAS}h depois de publicados.</p>
            ) : (
              <div className="flex gap-3 overflow-x-auto pb-1">
                {stories.map(s => (
                  <div key={s.id} className="shrink-0 w-28">
                    <div className="relative w-28 h-40 rounded-xl overflow-hidden bg-elevado border border-borda">
                      {s.tipo === 'video'
                        ? <video src={s.midia_url} className="w-full h-full object-cover" muted playsInline />
                        : <img src={s.midia_url} alt="" className="w-full h-full object-cover" />}
                      <button
                        onClick={() => apagar('stories', s.id)}
                        className="absolute top-1 right-1 bg-black/60 hover:bg-red-600 text-white p-1 rounded-lg transition"
                        aria-label="Apagar story"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                    <p className="text-gray-500 text-[11px] mt-1">{tempoDoPost(s.created_at)}</p>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Posts + métricas */}
          <section>
            <h2 className="text-white font-semibold mb-2 flex items-center gap-2">
              <ImageIcon size={16} className="text-azul" /> Posts
              <span className="text-gray-500 text-xs font-normal">({posts.length})</span>
            </h2>
            {posts.length === 0 ? (
              <p className="text-gray-500 text-sm">Você ainda não publicou nada. O primeiro post aparece no feed dos clientes por perto.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {posts.map(p => {
                  const m = metricas[p.id]
                  return (
                    <div key={p.id} className="bg-card border border-borda rounded-2xl p-3 flex gap-3">
                      <div className="w-20 h-20 rounded-xl overflow-hidden bg-elevado shrink-0 relative">
                        {p.tipo === 'video'
                          ? <video src={p.midia_url} className="w-full h-full object-cover" muted playsInline />
                          : <img src={p.midia_url} alt="" className="w-full h-full object-cover" />}
                        {p.tipo === 'video' && (
                          <Film size={13} className="absolute bottom-1 right-1 text-white drop-shadow" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-gray-300 text-sm line-clamp-2">{p.legenda || <span className="text-gray-600">Sem legenda</span>}</p>
                          <button
                            onClick={() => apagar('posts', p.id)}
                            className="shrink-0 text-gray-500 hover:text-red-400 transition"
                            aria-label="Apagar post"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                        {p.produto_id && nomeProduto(p.produto_id) && (
                          <p className="text-acento text-xs mt-0.5">🏷️ {nomeProduto(p.produto_id)}</p>
                        )}
                        <p className="text-gray-600 text-[11px] mt-0.5">{tempoDoPost(p.created_at)}</p>

                        <div className="flex items-center gap-4 mt-2 text-xs">
                          <span className="flex items-center gap-1 text-gray-400" title="Visualizações">
                            <Eye size={13} /> {m?.visualizacoes ?? 0}
                          </span>
                          <span className="flex items-center gap-1 text-gray-400" title="Curtidas">
                            <Heart size={13} /> {m?.likes ?? 0}
                          </span>
                          <span className="flex items-center gap-1 text-gray-400" title="Comentários">
                            <MessageCircle size={13} /> {m?.comentarios ?? 0}
                          </span>
                          <span className="flex items-center gap-1 text-acento" title="Cliques em Pedir agora">
                            <ShoppingBag size={13} /> {m?.cliques_pedir ?? 0}
                          </span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        </div>
      )}
    </AppLayout>
  )
}
