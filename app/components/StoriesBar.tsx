'use client'
import { useEffect, useState } from 'react'
import { X, Store, ShoppingBag, ChevronLeft, ChevronRight } from 'lucide-react'
import { tempoDoPost, type Story, type LojaDoFeed, type ProdutoMarcado } from '../lib/feed'

/** Quanto tempo uma FOTO fica na tela antes de avançar sozinha. */
const DURACAO_FOTO_MS = 5000

type Grupo = { loja_id: string; stories: Story[] }

type Props = {
  grupos: Grupo[]
  lojas: Map<string, LojaDoFeed>
  produtos: Map<string, ProdutoMarcado>
  onPedir: (lojaId: string) => void
}

export function StoriesBar({ grupos, lojas, produtos, onPedir }: Props) {
  // Índice do grupo aberto e do story dentro dele. `null` = visualizador fechado.
  const [aberto, setAberto] = useState<{ grupo: number; story: number } | null>(null)

  const grupoAtual = aberto ? grupos[aberto.grupo] : null
  const storyAtual = grupoAtual ? grupoAtual.stories[aberto!.story] : null

  function avancar() {
    if (!aberto || !grupoAtual) return
    if (aberto.story + 1 < grupoAtual.stories.length) {
      setAberto({ ...aberto, story: aberto.story + 1 })
    } else if (aberto.grupo + 1 < grupos.length) {
      setAberto({ grupo: aberto.grupo + 1, story: 0 })
    } else {
      setAberto(null)
    }
  }

  function voltar() {
    if (!aberto) return
    if (aberto.story > 0) setAberto({ ...aberto, story: aberto.story - 1 })
    else if (aberto.grupo > 0) {
      const anterior = grupos[aberto.grupo - 1]
      setAberto({ grupo: aberto.grupo - 1, story: anterior.stories.length - 1 })
    }
  }

  // Foto avança sozinha; vídeo espera o `onEnded`.
  useEffect(() => {
    if (!storyAtual || storyAtual.tipo === 'video') return
    const t = setTimeout(avancar, DURACAO_FOTO_MS)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storyAtual?.id])

  // Esc fecha, setas navegam.
  useEffect(() => {
    if (!aberto) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAberto(null)
      if (e.key === 'ArrowRight') avancar()
      if (e.key === 'ArrowLeft') voltar()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto])

  if (grupos.length === 0) return null

  const produtoDoStory = storyAtual?.produto_id ? produtos.get(storyAtual.produto_id) : undefined

  return (
    <>
      <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1">
        {grupos.map((g, i) => {
          const loja = lojas.get(g.loja_id)
          const fachada = loja?.fotos_fachada?.[0]
          return (
            <button
              key={g.loja_id}
              onClick={() => setAberto({ grupo: i, story: 0 })}
              className="flex flex-col items-center gap-1.5 shrink-0 w-[70px]"
            >
              {/* Anel gradiente = tem story novo, igual ao Instagram. */}
              <span className="p-[2px] rounded-full bg-gradient-to-tr from-[#C1441E] via-[#E0632C] to-amber-400">
                <span className="block p-[2px] rounded-full bg-gray-950">
                  <span className="w-14 h-14 rounded-full overflow-hidden bg-[#1B2129] flex items-center justify-center">
                    {fachada
                      ? <img src={fachada} alt="" className="w-full h-full object-cover" />
                      : <Store size={18} className="text-gray-400" />}
                  </span>
                </span>
              </span>
              <span className="text-gray-300 text-[11px] truncate w-full text-center">{loja?.nome || 'Loja'}</span>
            </button>
          )
        })}
      </div>

      {aberto && storyAtual && grupoAtual && (
        <div className="fixed inset-0 z-[60] bg-black flex flex-col">
          {/* Barrinhas de progresso — uma por story do grupo. */}
          <div className="flex gap-1 p-2 shrink-0">
            {grupoAtual.stories.map((s, i) => (
              <span key={s.id} className="flex-1 h-0.5 rounded-full bg-white/25 overflow-hidden">
                <span className={`block h-full bg-white ${i < aberto.story ? 'w-full' : i === aberto.story ? 'w-1/2' : 'w-0'}`} />
              </span>
            ))}
          </div>

          <div className="flex items-center gap-2 px-3 pb-2 shrink-0">
            <span className="w-8 h-8 rounded-full overflow-hidden bg-[#1B2129] flex items-center justify-center">
              {lojas.get(grupoAtual.loja_id)?.fotos_fachada?.[0]
                ? <img src={lojas.get(grupoAtual.loja_id)!.fotos_fachada![0]} alt="" className="w-full h-full object-cover" />
                : <Store size={14} className="text-gray-400" />}
            </span>
            <p className="text-white text-sm font-semibold flex-1 truncate">{lojas.get(grupoAtual.loja_id)?.nome || 'Loja'}</p>
            <span className="text-white/60 text-xs">{tempoDoPost(storyAtual.created_at)}</span>
            <button onClick={() => setAberto(null)} className="text-white/80 hover:text-white p-1" aria-label="Fechar">
              <X size={22} />
            </button>
          </div>

          <div className="flex-1 relative min-h-0 flex items-center justify-center">
            {storyAtual.tipo === 'video' ? (
              <video
                key={storyAtual.id}
                src={storyAtual.midia_url}
                className="max-h-full max-w-full"
                autoPlay
                playsInline
                controls={false}
                onEnded={avancar}
              />
            ) : (
              <img src={storyAtual.midia_url} alt="" className="max-h-full max-w-full object-contain" />
            )}

            {/* Metades clicáveis: esquerda volta, direita avança. */}
            <button onClick={voltar} aria-label="Anterior" className="absolute inset-y-0 left-0 w-1/3 flex items-center justify-start pl-2 text-white/0 hover:text-white/50">
              <ChevronLeft size={28} />
            </button>
            <button onClick={avancar} aria-label="Próximo" className="absolute inset-y-0 right-0 w-1/3 flex items-center justify-end pr-2 text-white/0 hover:text-white/50">
              <ChevronRight size={28} />
            </button>
          </div>

          {produtoDoStory && (
            <div className="shrink-0 p-4">
              <button
                onClick={() => { setAberto(null); onPedir(grupoAtual.loja_id) }}
                className="w-full bg-[#C1441E] hover:bg-[#a83a19] text-white font-semibold py-3 rounded-xl transition flex items-center justify-center gap-2"
              >
                <ShoppingBag size={18} />
                Pedir este item — {produtoDoStory.nome}
              </button>
            </div>
          )}
        </div>
      )}
    </>
  )
}
