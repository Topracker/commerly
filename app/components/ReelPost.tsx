'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Heart, MessageCircle, Share2, ShoppingBag, Store, Plus, Check,
  Volume2, VolumeX, Play, MapPin,
} from 'lucide-react'
import { formatarDistancia } from '../lib/geo'
import { contadorCurto, tempoDoPost, type Post, type LojaDoFeed, type ProdutoMarcado } from '../lib/feed'

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
  /** km até a loja; null quando falta coordenada de um dos lados. */
  distancia: number | null
  curtido: boolean
  likes: number
  comentarios: number
  compartilhamentos: number
  seguindo: boolean
  /** Este é o post na tela. Só ele toca o vídeo. */
  ativo: boolean
  /** Som ligado/desligado — é global no feed, igual ao TikTok. */
  som: boolean
  onAlternarSom: () => void
  onCurtir: () => void
  onSeguir: () => void
  onComentarios: () => void
  onCompartilhar: () => void
  onPedir: () => void
}

const reais = (v: number) => `R$ ${Number(v).toFixed(2).replace('.', ',')}`

export function ReelPost({
  post, loja, produto, distancia, curtido, likes, comentarios, compartilhamentos,
  seguindo, ativo, som, onAlternarSom, onCurtir, onSeguir, onComentarios,
  onCompartilhar, onPedir,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [pausado, setPausado] = useState(false)
  const [pronto, setPronto] = useState(post.tipo !== 'video')
  const [legendaAberta, setLegendaAberta] = useState(false)
  const router = useRouter()

  // Autoplay/pause seguem a visibilidade. `play()` devolve uma promise que
  // rejeita quando o navegador recusa o autoplay — engolir é proposital: o
  // usuário ainda tem o toque na tela para dar play.
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    if (ativo) {
      setPausado(false)
      v.currentTime = 0
      v.play().catch(() => setPausado(true))
    } else {
      v.pause()
    }
  }, [ativo])

  // `muted` como atributo JSX não é confiável na hidratação — o navegador pode
  // ficar com o valor do HTML inicial. Escrever na propriedade do DOM garante.
  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = !som
  }, [som])

  function alternarPlay() {
    const v = videoRef.current
    if (!v) return
    if (v.paused) { v.play().catch(() => {}); setPausado(false) }
    else { v.pause(); setPausado(true) }
  }

  const fachada = loja?.fotos_fachada?.[0]
  const ehVideo = post.tipo === 'video'

  return (
    <article className="relative h-full w-full shrink-0 snap-start snap-always overflow-hidden bg-black">
      {/* Fundo desfocado da fachada: cobre a barra preta enquanto o vídeo
          carrega e nas mídias que não preenchem a tela inteira. */}
      {fachada && (
        <img src={fachada} alt="" aria-hidden className="absolute inset-0 h-full w-full scale-110 object-cover opacity-30 blur-2xl" />
      )}

      <button
        type="button"
        onClick={ehVideo ? alternarPlay : undefined}
        className="absolute inset-0 h-full w-full"
        aria-label={ehVideo ? (pausado ? 'Reproduzir vídeo' : 'Pausar vídeo') : undefined}
      >
        {ehVideo ? (
          <video
            ref={videoRef}
            src={post.midia_url}
            className="h-full w-full object-cover"
            loop
            muted
            playsInline
            preload="metadata"
            onLoadedData={() => setPronto(true)}
            onPlaying={() => setPronto(true)}
          />
        ) : (
          <img src={post.midia_url} alt={post.legenda || ''} className="h-full w-full object-cover" />
        )}
      </button>

      {/* Vídeo ainda sem o primeiro quadro: um pulso discreto em vez do
          retângulo cinza morto do player. */}
      {ehVideo && !pronto && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <span className="h-10 w-10 animate-spin rounded-full border-2 border-white/25 border-t-white/80" />
        </div>
      )}

      {ehVideo && pausado && pronto && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <Play size={56} className="fill-white/80 text-white/80 drop-shadow-lg" />
        </div>
      )}

      {/* Degradês: garantem contraste dos textos sobre QUALQUER mídia — vídeo
          claro (fundo branco) é o caso difícil, e sem isto o nome da loja e os
          contadores brancos somem. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/55 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-72 bg-gradient-to-t from-black/85 via-black/45 to-transparent" />

      {ehVideo && (
        <button
          onClick={onAlternarSom}
          className="absolute right-3 top-14 z-20 rounded-full bg-black/45 p-2.5 text-white backdrop-blur-sm transition hover:bg-black/70 md:top-4"
          aria-label={som ? 'Desativar som' : 'Ativar som'}
        >
          {som ? <Volume2 size={18} /> : <VolumeX size={18} />}
        </button>
      )}

      {/* ------------------------------------------------------------------
          Coluna de ações — lateral direita.
      ------------------------------------------------------------------ */}
      {/* `env(safe-area-inset-bottom)`: no iPhone a barra de gestos cobriria o
          botão "Pedir agora" e a distância. */}
      <div className="absolute bottom-[calc(1.5rem+env(safe-area-inset-bottom))] right-2.5 z-20 flex w-16 flex-col items-center gap-5">
        <div className="relative">
          <button
            onClick={() => router.push(`/cliente/loja/${post.loja_id}`)}
            className="block h-12 w-12 overflow-hidden rounded-full border-2 border-white bg-white/15"
            aria-label={`Abrir ${loja?.nome || 'a loja'}`}
          >
            {fachada
              ? <img src={fachada} alt="" className="h-full w-full object-cover" />
              : <span className="grid h-full w-full place-items-center"><Store size={18} className="text-white/70" /></span>}
          </button>
          <button
            onClick={onSeguir}
            aria-label={seguindo ? 'Deixar de seguir' : 'Seguir loja'}
            aria-pressed={seguindo}
            className={`absolute -bottom-2 left-1/2 grid h-5 w-5 -translate-x-1/2 place-items-center rounded-full text-white shadow-lg transition ${
              seguindo ? 'bg-white/35 backdrop-blur-sm' : 'bg-acento hover:brightness-110'
            }`}
          >
            {seguindo ? <Check size={12} strokeWidth={3} /> : <Plus size={13} strokeWidth={3} />}
          </button>
        </div>

        <AcaoLateral
          onClick={onCurtir}
          rotulo={contadorCurto(likes)}
          aria={curtido ? 'Descurtir' : 'Curtir'}
          pressionado={curtido}
        >
          <Heart size={30} className={curtido ? 'fill-red-500 text-red-500' : 'text-white'} />
        </AcaoLateral>

        <AcaoLateral onClick={onComentarios} rotulo={contadorCurto(comentarios)} aria="Ver comentários">
          <MessageCircle size={29} className="text-white" />
        </AcaoLateral>

        <AcaoLateral onClick={onCompartilhar} rotulo={contadorCurto(compartilhamentos)} aria="Compartilhar">
          <Share2 size={27} className="text-white" />
        </AcaoLateral>

        <button
          onClick={onPedir}
          className="flex flex-col items-center gap-1"
          aria-label="Pedir agora"
        >
          <span className="grid h-12 w-12 place-items-center rounded-full bg-azul shadow-lg shadow-azul/40 transition hover:brightness-110">
            <ShoppingBag size={22} className="text-white" />
          </span>
          <span className="text-[10px] font-bold leading-tight text-white drop-shadow">Pedir agora</span>
        </button>
      </div>

      {/* ------------------------------------------------------------------
          Informações — base esquerda. `right-20` abre espaço para a coluna.
      ------------------------------------------------------------------ */}
      <div className="absolute bottom-[calc(1.5rem+env(safe-area-inset-bottom))] left-4 right-20 z-20">
        <button
          onClick={() => router.push(`/cliente/loja/${post.loja_id}`)}
          className="block max-w-full text-left"
        >
          <p className="truncate text-[15px] font-bold text-white drop-shadow">{loja?.nome || 'Loja'}</p>
        </button>

        {post.legenda && (
          <p
            onClick={() => setLegendaAberta(v => !v)}
            className={`mt-1 cursor-pointer whitespace-pre-wrap text-sm leading-snug text-white/90 drop-shadow ${legendaAberta ? '' : 'line-clamp-2'}`}
          >
            {post.legenda}
          </p>
        )}

        {produto && (
          <button
            onClick={onPedir}
            className="mt-2 flex max-w-full items-center gap-2 rounded-full bg-white/15 px-3 py-1.5 backdrop-blur-sm transition hover:bg-white/25"
          >
            <ShoppingBag size={13} className="shrink-0 text-white" />
            <span className="truncate text-xs font-medium text-white">{produto.nome}</span>
            <span className="shrink-0 text-xs font-bold text-acento">{reais(produto.preco_venda)}</span>
          </button>
        )}

        <div className="mt-2 flex items-center gap-3 text-[11px] text-white/70 drop-shadow">
          {distancia != null && (
            <span className="flex items-center gap-1">
              <MapPin size={11} /> {formatarDistancia(distancia)}
            </span>
          )}
          <span>{tempoDoPost(post.created_at)}</span>
        </div>
      </div>
    </article>
  )
}

/** Ícone grande + contador embaixo — o formato repetido da coluna lateral. */
function AcaoLateral({
  children, rotulo, onClick, aria, pressionado,
}: {
  children: React.ReactNode
  rotulo: string
  onClick: () => void
  aria: string
  pressionado?: boolean
}) {
  return (
    <button
      onClick={onClick}
      aria-label={aria}
      {...(pressionado === undefined ? {} : { 'aria-pressed': pressionado })}
      className="flex flex-col items-center gap-1 transition active:scale-90"
    >
      <span className="drop-shadow-lg">{children}</span>
      <span className="text-[11px] font-semibold text-white drop-shadow">{rotulo}</span>
    </button>
  )
}
