'use client'
import { useRef } from 'react'
import { Camera, Images, RefreshCw, X, Film } from 'lucide-react'
import { MAX_FOTO_MB, MAX_VIDEO_MB, type TipoMidia } from '../lib/feed'

export type MidiaEscolhida = { file: File; preview: string; tipo: TipoMidia }

const ACEITA = 'image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime'

/** "4,2 MB" */
function tamanho(bytes: number): string {
  const mb = bytes / (1024 * 1024)
  return `${mb.toFixed(1).replace('.', ',')} MB`
}

/**
 * Escolha da mídia do post/story: câmera, galeria e preview do resultado real.
 *
 * Por que DOIS inputs e não um: o atributo `capture` não é "prefira a câmera",
 * é "só a câmera". Com ele presente, o Android Chrome tira a opção de escolher
 * um arquivo existente. Um input só não consegue oferecer as duas coisas — daí
 * um input com `capture` e outro sem.
 *
 * O card da câmera só aparece em aparelho de toque (`pointer: coarse`). No
 * desktop `capture` é ignorado e o botão viraria um segundo caminho para o
 * mesmo seletor de arquivos, o que só confunde.
 *
 * Este componente não conhece Supabase: devolve um `File` por `onSelecionar` e
 * quem publica continua sendo a página. A captura por câmera entrega um `File`
 * igual ao da galeria, então nada muda no upload.
 */
export function SeletorMidiaFeed({ midia, onSelecionar, onLimpar }: {
  midia: MidiaEscolhida | null
  onSelecionar: (file: File | undefined) => void
  onLimpar: () => void
}) {
  const camera = useRef<HTMLInputElement>(null)
  const galeria = useRef<HTMLInputElement>(null)

  const inputs = (
    <>
      {/* `capture` manda o sistema abrir a câmera traseira direto. */}
      <input
        ref={camera} type="file" accept={ACEITA} capture="environment"
        className="hidden" data-teste="input-camera"
        onChange={e => { onSelecionar(e.target.files?.[0]); e.target.value = '' }}
      />
      {/* Sem `capture`: galeria/arquivos, o comportamento de sempre. */}
      <input
        ref={galeria} type="file" accept={ACEITA}
        className="hidden" data-teste="input-galeria"
        onChange={e => { onSelecionar(e.target.files?.[0]); e.target.value = '' }}
      />
    </>
  )

  if (midia) {
    return (
      <div data-teste="preview-midia">
        {/* 9:16 com object-cover porque é EXATAMENTE assim que o feed do
            cliente mostra (ReelPost: tela cheia, object-cover sobre preto).
            Com object-contain o comerciante via a foto inteira aqui e ela
            saía cortada lá. */}
        <div className="relative mx-auto w-full max-w-[220px] aspect-[9/16] rounded-2xl overflow-hidden bg-black border border-borda">
          {midia.tipo === 'video'
            ? <video src={midia.preview} className="h-full w-full object-cover" controls playsInline />
            : <img src={midia.preview} alt="Pré-visualização do post" className="h-full w-full object-cover" />}

          <div className="absolute top-2 right-2 flex gap-1.5">
            <button
              type="button" onClick={() => galeria.current?.click()}
              className="bg-black/60 hover:bg-black/80 text-white p-2 rounded-xl transition backdrop-blur-sm"
              aria-label="Trocar mídia" data-teste="trocar"
            >
              <RefreshCw size={15} />
            </button>
            <button
              type="button" onClick={onLimpar}
              className="bg-black/60 hover:bg-red-600 text-white p-2 rounded-xl transition backdrop-blur-sm"
              aria-label="Remover mídia" data-teste="remover"
            >
              <X size={15} />
            </button>
          </div>

          {midia.tipo === 'video' && (
            <span className="absolute bottom-2 left-2 flex items-center gap-1 bg-black/60 text-white text-[11px] px-2 py-1 rounded-lg backdrop-blur-sm">
              <Film size={11} /> vídeo
            </span>
          )}
        </div>

        <p className="text-center text-gray-500 text-xs mt-2">
          É assim que vai aparecer no feed · {tamanho(midia.file.size)}
        </p>
        {inputs}
      </div>
    )
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-3">
        {/* Variante arbitrária do Tailwind: só aparece onde o ponteiro é
            grosso (dedo). Feita assim, e não com uma variante nomeada, para
            não precisar tocar em globals.css — mexer lá obriga `rm -rf .next`
            (regra 18) e reconstruir as vars do Tailwind v4 por um detalhe. */}
        <button
          type="button" onClick={() => camera.current?.click()}
          className="hidden [@media(pointer:coarse)]:flex aspect-[4/5] flex-col items-center justify-center gap-2 rounded-2xl bg-superficie border border-borda hover:border-acento active:scale-[0.98] transition"
          data-teste="card-camera"
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-acento/15">
            <Camera size={22} className="text-acento" />
          </span>
          <span className="text-white text-sm font-semibold">Câmera</span>
          <span className="text-gray-500 text-xs">Foto ou vídeo</span>
        </button>

        <button
          type="button" onClick={() => galeria.current?.click()}
          className="col-span-2 [@media(pointer:coarse)]:col-span-1 flex aspect-[4/5] flex-col items-center justify-center gap-2 rounded-2xl bg-superficie border border-borda hover:border-acento active:scale-[0.98] transition"
          data-teste="card-galeria"
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-elevado">
            <Images size={22} className="text-gray-300" />
          </span>
          <span className="text-white text-sm font-semibold">Galeria</span>
          <span className="text-gray-500 text-xs">Do aparelho</span>
        </button>
      </div>

      {/* O limite vem ANTES de gravar de propósito: `capture` não deixa limitar
          duração nem qualidade, então um vídeo de poucos segundos já passa de
          25 MB e só seria recusado depois do esforço de gravar. */}
      <p className="text-center text-gray-600 text-xs mt-3">
        Foto até {MAX_FOTO_MB} MB · vídeo até {MAX_VIDEO_MB} MB
      </p>
      {inputs}
    </div>
  )
}

export default SeletorMidiaFeed
