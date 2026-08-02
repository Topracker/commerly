// Feed Social: tipos, upload de mídia e a ordenação do feed.
//
// A ordenação é função pura — dá para testar sem banco, e é o coração da
// experiência do cliente.

import { distanciaKm, type Coord } from './geo'

export type TipoMidia = 'foto' | 'video'

export type LojaDoFeed = {
  id: string
  nome: string
  tipo?: string | null
  latitude?: number | null
  longitude?: number | null
  fotos_fachada?: string[] | null
}

export type Post = {
  id: string
  loja_id: string
  tipo: TipoMidia
  midia_url: string
  legenda: string | null
  produto_id: string | null
  created_at: string
  /**
   * Total de compartilhamentos. Mora numa coluna de `posts` (e não numa
   * contagem de `post_eventos`) porque a RLS de `post_eventos` só deixa cada
   * cliente ver as próprias linhas — contar de lá daria no máximo 1.
   * Mantido por trigger; ver sql/2026-08-02-feed-compartilhamentos.sql.
   */
  compartilhamentos?: number | null
}

export type Story = {
  id: string
  loja_id: string
  tipo: TipoMidia
  midia_url: string
  produto_id: string | null
  created_at: string
  expira_em: string
}

export type ProdutoMarcado = { id: string; nome: string; preco_venda: number }

/** Story dura 24h — o mesmo `interval` do default de `stories.expira_em`. */
export const STORY_HORAS = 24

/** Além deste raio a loja não pontua por proximidade. */
export const FEED_RAIO_KM = 15

/** Um post para de pontuar por novidade depois disto. */
export const FEED_JANELA_HORAS = 72

/** Pesos do score do feed. Seguir pesa mais que estar perto ou ser recente. */
export const PESO_SEGUE = 3
export const PESO_RECENCIA = 1.5
export const PESO_PROXIMIDADE = 1

/** Sem coordenadas não dá para medir distância; vale um meio-termo neutro. */
const PROXIMIDADE_NEUTRA = 0.3

export const MAX_FOTO_MB = 6
export const MAX_VIDEO_MB = 25
const TIPOS_FOTO = ['image/jpeg', 'image/png', 'image/webp']
const TIPOS_VIDEO = ['video/mp4', 'video/webm', 'video/quicktime']

export function tipoDaMidia(file: File): TipoMidia | null {
  if (TIPOS_FOTO.includes(file.type)) return 'foto'
  if (TIPOS_VIDEO.includes(file.type)) return 'video'
  return null
}

/** '' quando o arquivo serve; mensagem de erro caso contrário. */
export function erroMidia(file: File): string {
  const tipo = tipoDaMidia(file)
  if (!tipo) return 'Envie uma foto (JPG, PNG, WebP) ou um vídeo (MP4, WebM, MOV).'
  const limite = tipo === 'foto' ? MAX_FOTO_MB : MAX_VIDEO_MB
  if (file.size > limite * 1024 * 1024) {
    return `${tipo === 'foto' ? 'A foto' : 'O vídeo'} deve ter no máximo ${limite} MB.`
  }
  return ''
}

/**
 * Sobe a mídia para o bucket público `feed`, em `feed/{loja_id}/...` — o prefixo
 * é o que a policy de storage confere contra a loja do comerciante.
 */
export async function uploadMidiaFeed(
  supabase: any,
  lojaId: string,
  file: File,
): Promise<{ url: string; tipo: TipoMidia } | { error: string }> {
  const erro = erroMidia(file)
  if (erro) return { error: erro }
  const tipo = tipoDaMidia(file)!

  const ext = file.name.split('.').pop()?.toLowerCase() || (tipo === 'foto' ? 'jpg' : 'mp4')
  const caminho = `${lojaId}/${crypto.randomUUID()}.${ext}`

  const { error } = await supabase.storage.from('feed').upload(caminho, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type,
  })
  if (error) return { error: 'Não foi possível enviar a mídia. Tente de novo.' }

  const { data } = supabase.storage.from('feed').getPublicUrl(caminho)
  return { url: data.publicUrl, tipo }
}

/** Horas desde a publicação. */
function idadeHoras(iso: string, agora: number): number {
  return (agora - new Date(iso).getTime()) / 3_600_000
}

/**
 * Score de um post no feed do cliente:
 *   - segue a loja: o maior peso, é uma escolha explícita dele;
 *   - recência: cai linearmente até zerar em FEED_JANELA_HORAS;
 *   - proximidade: cai linearmente até zerar em FEED_RAIO_KM.
 *
 * Sem coordenadas (do cliente ou da loja) a proximidade vira um valor neutro —
 * chutar "muito perto" empurraria lojas sem endereço para o topo.
 */
export function scoreDoPost(
  post: Post,
  loja: LojaDoFeed | undefined,
  opcoes: { seguindo: Set<string>; posCliente?: Coord | null; agora?: number },
): number {
  const agora = opcoes.agora ?? Date.now()

  const segue = opcoes.seguindo.has(post.loja_id) ? 1 : 0

  const horas = idadeHoras(post.created_at, agora)
  const recencia = Math.max(0, 1 - horas / FEED_JANELA_HORAS)

  const km = opcoes.posCliente && loja ? distanciaKm(opcoes.posCliente, loja) : null
  const proximidade = km == null ? PROXIMIDADE_NEUTRA : Math.max(0, 1 - km / FEED_RAIO_KM)

  return PESO_SEGUE * segue + PESO_RECENCIA * recencia + PESO_PROXIMIDADE * proximidade
}

/**
 * Ordena o feed por score. Empate desempata pelo mais recente, para a ordem ser
 * determinística (dois posts sem coordenada e da mesma idade sairiam aleatórios).
 */
export function ordenarFeed(
  posts: Post[],
  lojas: Map<string, LojaDoFeed>,
  opcoes: { seguindo: Set<string>; posCliente?: Coord | null; agora?: number },
): Post[] {
  const agora = opcoes.agora ?? Date.now()
  const comScore = posts.map(p => ({
    post: p,
    score: scoreDoPost(p, lojas.get(p.loja_id), { ...opcoes, agora }),
  }))
  comScore.sort((a, b) =>
    b.score - a.score
    || new Date(b.post.created_at).getTime() - new Date(a.post.created_at).getTime(),
  )
  return comScore.map(x => x.post)
}

/** Stories vivos agrupados por loja, loja mais recente primeiro. */
export function agruparStories(stories: Story[]): { loja_id: string; stories: Story[] }[] {
  const grupos = new Map<string, Story[]>()
  for (const s of stories) {
    const lista = grupos.get(s.loja_id) || []
    lista.push(s)
    grupos.set(s.loja_id, lista)
  }
  return [...grupos.entries()]
    .map(([loja_id, lista]) => ({
      loja_id,
      stories: lista.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
    }))
    .sort((a, b) => {
      const ultimoA = a.stories[a.stories.length - 1].created_at
      const ultimoB = b.stories[b.stories.length - 1].created_at
      return new Date(ultimoB).getTime() - new Date(ultimoA).getTime()
    })
}

/**
 * Contador da coluna lateral do feed: cabe em ~4 caracteres.
 * 0 → "0" · 999 → "999" · 1500 → "1,5 mil" · 1200000 → "1,2 mi"
 */
export function contadorCurto(n: number): string {
  if (n < 1000) return String(n)
  if (n < 1_000_000) {
    const mil = n / 1000
    return `${(mil < 10 ? mil.toFixed(1) : Math.round(mil).toString()).replace('.', ',')} mil`
  }
  const mi = n / 1_000_000
  return `${(mi < 10 ? mi.toFixed(1) : Math.round(mi).toString()).replace('.', ',')} mi`
}

/** "há 2 h", "há 3 d" — rótulo curto para o card do post. */
export function tempoDoPost(iso: string, agora = Date.now()): string {
  const min = Math.floor((agora - new Date(iso).getTime()) / 60_000)
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `há ${h} h`
  const d = Math.floor(h / 24)
  return `há ${d} d`
}
