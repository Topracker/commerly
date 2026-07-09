'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useCliente } from '../../hooks/useCliente'
import { useToast } from '../../hooks/useToast'
import { Toast } from '../../components/Toast'
import { ClienteLayout } from '../../components/ClienteLayout'
import { StoriesBar } from '../../components/StoriesBar'
import { PostCard, type Comentario } from '../../components/PostCard'
import {
  agruparStories, ordenarFeed,
  type LojaDoFeed, type Post, type ProdutoMarcado, type Story,
} from '../../lib/feed'
import { Rss } from 'lucide-react'

export default function ClienteFeed() {
  const { cliente, loading, supabase, sair } = useCliente()
  const { toast, mostrarToast } = useToast()
  const router = useRouter()

  const [posts, setPosts] = useState<Post[]>([])
  const [stories, setStories] = useState<Story[]>([])
  const [lojas, setLojas] = useState<Map<string, LojaDoFeed>>(new Map())
  const [produtos, setProdutos] = useState<Map<string, ProdutoMarcado>>(new Map())
  const [seguindo, setSeguindo] = useState<Set<string>>(new Set())
  const [curtidos, setCurtidos] = useState<Set<string>>(new Set())
  const [likes, setLikes] = useState<Record<string, number>>({})
  const [comentarios, setComentarios] = useState<Record<string, Comentario[]>>({})
  const [posCliente, setPosCliente] = useState<{ latitude: number; longitude: number } | null>(null)
  const [carregando, setCarregando] = useState(true)

  // Posição do cliente: só melhora a ordenação. Sem permissão, o feed continua
  // funcionando (a proximidade vira neutra para todos).
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      p => setPosCliente({ latitude: p.coords.latitude, longitude: p.coords.longitude }),
      () => { /* sem GPS: ordena por seguir + recência */ },
      { maximumAge: 300_000, timeout: 8000 },
    )
  }, [])

  useEffect(() => { if (cliente) carregar() }, [cliente])

  async function carregar() {
    const agora = new Date().toISOString()
    const [postsRes, storiesRes, lojasRes, seguindoRes, likesRes] = await Promise.all([
      supabase.from('posts').select('*').order('created_at', { ascending: false }).limit(60),
      supabase.from('stories').select('*').gt('expira_em', agora).order('created_at', { ascending: false }),
      supabase.from('lojas_publicas').select('id, nome, tipo, latitude, longitude, fotos_fachada'),
      supabase.from('loja_seguidores').select('loja_id').eq('cliente_id', cliente.id),
      supabase.from('post_likes').select('post_id, cliente_id'),
    ])

    const listaPosts = (postsRes.data || []) as Post[]
    const listaStories = (storiesRes.data || []) as Story[]

    setPosts(listaPosts)
    setStories(listaStories)
    setLojas(new Map(((lojasRes.data || []) as LojaDoFeed[]).map(l => [l.id, l])))
    setSeguindo(new Set(((seguindoRes.data || []) as { loja_id: string }[]).map(s => s.loja_id)))

    // Curtidas: as minhas (para o coração) e a contagem por post (todas são
    // legíveis; `post_likes` tem select público).
    const todasCurtidas = (likesRes.data || []) as { post_id: string; cliente_id: string }[]
    setCurtidos(new Set(todasCurtidas.filter(l => l.cliente_id === cliente.id).map(l => l.post_id)))
    const contagem: Record<string, number> = {}
    for (const l of todasCurtidas) contagem[l.post_id] = (contagem[l.post_id] || 0) + 1
    setLikes(contagem)

    // Produtos marcados nos posts e stories — uma query só.
    const idsProdutos = [...new Set(
      [...listaPosts, ...listaStories].map(p => p.produto_id).filter((x): x is string => !!x),
    )]
    if (idsProdutos.length) {
      const { data } = await supabase.from('produtos').select('id, nome, preco_venda').in('id', idsProdutos)
      setProdutos(new Map(((data || []) as ProdutoMarcado[]).map(p => [p.id, p])))
    }

    // Comentários dos posts carregados, com o nome de quem escreveu.
    if (listaPosts.length) {
      const { data } = await supabase
        .from('post_comentarios')
        .select('id, post_id, cliente_id, texto, created_at, clientes(nome)')
        .in('post_id', listaPosts.map(p => p.id))
        .order('created_at', { ascending: true })
      const porPost: Record<string, Comentario[]> = {}
      for (const c of (data || []) as any[]) {
        const item: Comentario = {
          id: c.id, cliente_id: c.cliente_id, texto: c.texto,
          created_at: c.created_at, cliente_nome: c.clientes?.nome,
        }
        ;(porPost[c.post_id] ||= []).push(item)
      }
      setComentarios(porPost)
    }

    setCarregando(false)
  }

  const feed = useMemo(
    () => ordenarFeed(posts, lojas, { seguindo, posCliente }),
    [posts, lojas, seguindo, posCliente],
  )

  const gruposStories = useMemo(() => agruparStories(stories), [stories])

  async function curtir(post: Post) {
    const jaCurtiu = curtidos.has(post.id)
    // Otimista.
    setCurtidos(prev => {
      const n = new Set(prev)
      jaCurtiu ? n.delete(post.id) : n.add(post.id)
      return n
    })
    setLikes(prev => ({ ...prev, [post.id]: Math.max(0, (prev[post.id] || 0) + (jaCurtiu ? -1 : 1)) }))

    const { error } = jaCurtiu
      ? await supabase.from('post_likes').delete().eq('post_id', post.id).eq('cliente_id', cliente.id)
      : await supabase.from('post_likes').insert({ post_id: post.id, cliente_id: cliente.id })

    if (error) {
      // Reverte.
      setCurtidos(prev => {
        const n = new Set(prev)
        jaCurtiu ? n.add(post.id) : n.delete(post.id)
        return n
      })
      setLikes(prev => ({ ...prev, [post.id]: Math.max(0, (prev[post.id] || 0) + (jaCurtiu ? 1 : -1)) }))
      mostrarToast('Não foi possível curtir agora.', 'erro')
    }
  }

  async function comentar(post: Post, texto: string) {
    const { data, error } = await supabase
      .from('post_comentarios')
      .insert({ post_id: post.id, cliente_id: cliente.id, texto })
      .select('id, cliente_id, texto, created_at')
      .single()
    if (error || !data) { mostrarToast('Não foi possível comentar.', 'erro'); return }
    setComentarios(prev => ({
      ...prev,
      [post.id]: [...(prev[post.id] || []), { ...(data as any), cliente_nome: cliente.nome }],
    }))
  }

  /** Evento de métrica. Duplicata é no-op pelo índice único — ignoramos o erro. */
  function registrarEvento(postId: string, tipo: 'view' | 'pedir') {
    void supabase.from('post_eventos').insert({ post_id: postId, cliente_id: cliente.id, tipo })
  }

  function pedirAgora(post: Post) {
    registrarEvento(post.id, 'pedir')
    router.push(`/cliente/loja/${post.loja_id}`)
  }

  if (loading) return null
  if (!cliente) return null

  return (
    <ClienteLayout cliente={cliente} sair={sair}>
      <Toast toast={toast} />

      <div className="max-w-xl mx-auto">
        <h1 className="font-display text-2xl font-bold text-white mb-4 flex items-center gap-2">
          <Rss size={20} className="text-acento" /> Feed
        </h1>

        {gruposStories.length > 0 && (
          <div className="mb-5">
            <StoriesBar
              grupos={gruposStories}
              lojas={lojas}
              produtos={produtos}
              onPedir={lojaId => router.push(`/cliente/loja/${lojaId}`)}
            />
          </div>
        )}

        {carregando ? (
          <p className="text-gray-500 text-sm">Carregando o feed...</p>
        ) : feed.length === 0 ? (
          <div className="bg-card border border-borda rounded-2xl p-8 text-center">
            <p className="text-4xl mb-2">📭</p>
            <p className="text-gray-300 font-medium">Nada por aqui ainda</p>
            <p className="text-gray-500 text-sm mt-1">
              Siga as lojas que você gosta para ver as novidades delas primeiro.
            </p>
            <button
              onClick={() => router.push('/cliente/buscar')}
              className="mt-4 bg-azul hover:brightness-110 text-white font-semibold px-4 py-2.5 rounded-xl transition text-sm"
            >
              Descobrir lojas
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            {feed.map(post => (
              <PostCard
                key={post.id}
                post={post}
                loja={lojas.get(post.loja_id)}
                produto={post.produto_id ? produtos.get(post.produto_id) : undefined}
                curtido={curtidos.has(post.id)}
                likes={likes[post.id] || 0}
                comentarios={comentarios[post.id] || []}
                onCurtir={() => curtir(post)}
                onComentar={texto => comentar(post, texto)}
                onPedir={() => pedirAgora(post)}
                onVisualizar={() => registrarEvento(post.id, 'view')}
              />
            ))}
          </div>
        )}
      </div>
    </ClienteLayout>
  )
}
