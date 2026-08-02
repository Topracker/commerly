'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useCliente } from '../../hooks/useCliente'
import { useToast } from '../../hooks/useToast'
import { Toast } from '../../components/Toast'
import { ClienteLayout } from '../../components/ClienteLayout'
import { StoriesBar } from '../../components/StoriesBar'
import { ReelPost, type Comentario } from '../../components/ReelPost'
import { ComentariosPainel } from '../../components/ComentariosPainel'
import { distanciaKm } from '../../lib/geo'
import {
  agruparStories, ordenarFeed,
  type LojaDoFeed, type Post, type ProdutoMarcado, type Story,
} from '../../lib/feed'

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
  const [compartilhamentos, setCompartilhamentos] = useState<Record<string, number>>({})
  const [comentarios, setComentarios] = useState<Record<string, Comentario[]>>({})
  const [posCliente, setPosCliente] = useState<{ latitude: number; longitude: number } | null>(null)
  const [carregando, setCarregando] = useState(true)

  // Estado do "player": qual post está na tela, se o som está ligado e de qual
  // post o painel de comentários está aberto.
  const [ativoId, setAtivoId] = useState<string | null>(null)
  const [som, setSom] = useState(false)
  const [comentariosDe, setComentariosDe] = useState<string | null>(null)

  const containerRef = useRef<HTMLDivElement>(null)
  // Métricas que só valem uma vez por post nesta sessão. Ficam em ref para não
  // provocar render — e porque o índice único do banco já barra a duplicata.
  const visualizados = useRef(new Set<string>())
  const compartilhados = useRef(new Set<string>())

  // Posição do cliente: melhora a ordenação e alimenta a distância no rodapé.
  // Sem permissão, o feed continua funcionando (a proximidade vira neutra).
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
    setCompartilhamentos(Object.fromEntries(listaPosts.map(p => [p.id, p.compartilhamentos || 0])))

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

  // Um observer só para todos os reels: vence quem tem a maior fração visível.
  // Parado, o snap garante que isso é sempre um post inteiro; durante a rolagem
  // dois cruzam o limiar ao mesmo tempo, e comparar as frações desempata.
  // Os nós vêm do DOM (`data-post-id`) em vez de refs: um ref callback criado
  // por post seria recriado a cada render e desmontaria/remontaria o mapa à toa.
  useEffect(() => {
    const container = containerRef.current
    if (!container || feed.length === 0) return

    const fracoes = new Map<string, number>()
    const obs = new IntersectionObserver(
      entradas => {
        for (const e of entradas) {
          const id = (e.target as HTMLElement).dataset.postId
          if (id) fracoes.set(id, e.intersectionRatio)
        }
        let vencedor: string | null = null
        let maior = 0.5 // abaixo disso o post não é "o da tela"
        for (const [id, f] of fracoes) if (f > maior) { maior = f; vencedor = id }
        if (vencedor) setAtivoId(vencedor)
      },
      { root: container, threshold: [0, 0.25, 0.5, 0.75, 1] },
    )
    container.querySelectorAll<HTMLElement>('[data-post-id]').forEach(el => obs.observe(el))
    return () => obs.disconnect()
    // `carregando` na lista não é decoração: `carregar()` grava os posts e o
    // fim do carregamento em BATCHES diferentes (há `await` entre os dois).
    // Sem ele, o efeito rodava com `feed` já preenchido mas ainda mostrando o
    // spinner — `containerRef` nulo, observer nunca preso, nenhum post ficava
    // ativo e o vídeo não dava autoplay.
  }, [feed, carregando])

  // Visualização: conta uma vez por post, quando ele vira o post da tela.
  // O índice único no banco garante um evento por cliente/post de qualquer forma.
  useEffect(() => {
    if (!ativoId || visualizados.current.has(ativoId)) return
    visualizados.current.add(ativoId)
    registrarEvento(ativoId, 'view')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ativoId])

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

  async function seguir(lojaId: string) {
    const jaSegue = seguindo.has(lojaId)
    setSeguindo(prev => {
      const n = new Set(prev)
      jaSegue ? n.delete(lojaId) : n.add(lojaId)
      return n
    })

    const { error } = jaSegue
      ? await supabase.from('loja_seguidores').delete().eq('loja_id', lojaId).eq('cliente_id', cliente.id)
      : await supabase.from('loja_seguidores').insert({ loja_id: lojaId, cliente_id: cliente.id })

    if (error) {
      setSeguindo(prev => {
        const n = new Set(prev)
        jaSegue ? n.add(lojaId) : n.delete(lojaId)
        return n
      })
      mostrarToast('Não foi possível atualizar agora.', 'erro')
      return
    }
    if (!jaSegue) mostrarToast(`Seguindo ${lojas.get(lojaId)?.nome || 'a loja'}.`, 'sucesso')
  }

  async function comentar(postId: string, texto: string) {
    const { data, error } = await supabase
      .from('post_comentarios')
      .insert({ post_id: postId, cliente_id: cliente.id, texto })
      .select('id, cliente_id, texto, created_at')
      .single()
    if (error || !data) { mostrarToast('Não foi possível comentar.', 'erro'); return }
    setComentarios(prev => ({
      ...prev,
      [postId]: [...(prev[postId] || []), { ...(data as any), cliente_nome: cliente.nome }],
    }))
  }

  async function compartilhar(post: Post) {
    const url = `${window.location.origin}/loja/${post.loja_id}`
    const dados = {
      title: lojas.get(post.loja_id)?.nome || 'Commerly',
      text: post.legenda || 'Olha isso!',
      url,
    }

    let compartilhou = false
    let tentarClipboard = true

    // `navigator.share` existe em HTTPS/mobile, mas também aparece em desktops
    // onde a folha de compartilhamento não abre e a promise REJEITA. Só o
    // AbortError é desistência do usuário — qualquer outro erro cai no
    // clipboard, senão o botão não faria absolutamente nada.
    if (navigator.share) {
      try {
        await navigator.share(dados)
        compartilhou = true
        tentarClipboard = false
      } catch (e) {
        if ((e as Error)?.name === 'AbortError') tentarClipboard = false
      }
    }

    if (tentarClipboard) {
      try {
        await navigator.clipboard.writeText(url)
        mostrarToast('Link copiado!', 'sucesso')
        compartilhou = true
      } catch { mostrarToast('Não foi possível compartilhar agora.', 'erro') }
    }
    if (!compartilhou) return

    // O contador só sobe no primeiro compartilhamento de cada cliente — o
    // índice único de `post_eventos` recusa a repetição em silêncio.
    if (!compartilhados.current.has(post.id)) {
      compartilhados.current.add(post.id)
      setCompartilhamentos(prev => ({ ...prev, [post.id]: (prev[post.id] || 0) + 1 }))
      registrarEvento(post.id, 'compartilhar')
    }
  }

  /**
   * Evento de métrica. Duplicata é no-op pelo índice único — ignoramos o erro.
   *
   * O `.then()` NÃO é enfeite: o builder do PostgREST é preguiçoso, só dispara
   * o fetch quando alguém consome a thenable. O `void supabase...insert(...)`
   * que estava aqui montava a query e jogava fora sem nunca sair da máquina —
   * por isso `post_eventos` estava VAZIA e todo post aparecia com 0
   * visualizações e 0 cliques em "Pedir agora" no painel do comerciante.
   */
  function registrarEvento(postId: string, tipo: 'view' | 'pedir' | 'compartilhar') {
    supabase
      .from('post_eventos')
      .insert({ post_id: postId, cliente_id: cliente.id, tipo })
      .then(() => { /* gravado (ou duplicado, que dá no mesmo) */ })
  }

  function pedirAgora(post: Post) {
    registrarEvento(post.id, 'pedir')
    router.push(`/cliente/loja/${post.loja_id}`)
  }

  if (loading) return null
  if (!cliente) return null

  const postAberto = comentariosDe ? feed.find(p => p.id === comentariosDe) : null
  const noPrimeiro = feed.length > 0 && (ativoId === null || ativoId === feed[0].id)

  return (
    <ClienteLayout cliente={cliente} sair={sair} fullHeight barraSobreposta>
      <Toast toast={toast} />

      {/* `midia-cheia`: mantém preto e texto branco também no tema claro. */}
      <div className="midia-cheia relative flex-1 min-h-0 bg-black">
        {carregando ? (
          <div className="grid h-full place-items-center">
            <span className="h-9 w-9 animate-spin rounded-full border-2 border-white/20 border-t-white/70" />
          </div>
        ) : feed.length === 0 ? (
          <div className="grid h-full place-items-center px-8 text-center">
            <div>
              <p className="mb-2 text-4xl">📭</p>
              <p className="font-medium text-white">Nada por aqui ainda</p>
              <p className="mt-1 text-sm text-white/55">
                Siga as lojas que você gosta para ver as novidades delas primeiro.
              </p>
              <button
                onClick={() => router.push('/cliente/buscar')}
                className="mt-4 rounded-xl bg-azul px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
              >
                Descobrir lojas
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* `snap-mandatory` + `snap-always` no filho: a rolagem sempre para
                num post inteiro, nunca no meio de dois.
                `overscroll-contain` impede o pull-to-refresh de roubar o gesto. */}
            <div
              ref={containerRef}
              className="sem-barra h-full snap-y snap-mandatory overflow-y-auto overscroll-y-contain"
            >
              {feed.map(post => {
                const loja = lojas.get(post.loja_id)
                return (
                  <div key={post.id} data-post-id={post.id} className="h-full">
                    <ReelPost
                      post={post}
                      loja={loja}
                      produto={post.produto_id ? produtos.get(post.produto_id) : undefined}
                      distancia={posCliente && loja ? distanciaKm(posCliente, loja) : null}
                      curtido={curtidos.has(post.id)}
                      likes={likes[post.id] || 0}
                      comentarios={(comentarios[post.id] || []).length}
                      compartilhamentos={compartilhamentos[post.id] || 0}
                      seguindo={seguindo.has(post.loja_id)}
                      ativo={ativoId === post.id}
                      som={som}
                      onAlternarSom={() => setSom(v => !v)}
                      onCurtir={() => curtir(post)}
                      onSeguir={() => seguir(post.loja_id)}
                      onComentarios={() => setComentariosDe(post.id)}
                      onCompartilhar={() => compartilhar(post)}
                      onPedir={() => pedirAgora(post)}
                    />
                  </div>
                )
              })}
            </div>

            {/* Stories só enquanto o primeiro post está na tela — depois disso
                a faixa competiria com o conteúdo em tela cheia. */}
            {gruposStories.length > 0 && (
              <div
                className={`absolute inset-x-0 top-11 z-20 px-3 transition-opacity duration-300 md:top-3 ${
                  noPrimeiro ? 'opacity-100' : 'pointer-events-none opacity-0'
                }`}
              >
                <StoriesBar
                  grupos={gruposStories}
                  lojas={lojas}
                  produtos={produtos}
                  onPedir={lojaId => router.push(`/cliente/loja/${lojaId}`)}
                />
              </div>
            )}
          </>
        )}
      </div>

      <ComentariosPainel
        aberto={!!postAberto}
        comentarios={postAberto ? comentarios[postAberto.id] || [] : []}
        onFechar={() => setComentariosDe(null)}
        onEnviar={texto => comentar(comentariosDe!, texto)}
      />
    </ClienteLayout>
  )
}
