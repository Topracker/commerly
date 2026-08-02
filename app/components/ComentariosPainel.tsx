'use client'
import { useEffect, useRef, useState } from 'react'
import { X, Send, MessageCircle } from 'lucide-react'
import { tempoDoPost, contadorCurto } from '../lib/feed'
import type { Comentario } from './ReelPost'

type Props = {
  aberto: boolean
  comentarios: Comentario[]
  onFechar: () => void
  onEnviar: (texto: string) => Promise<void>
}

/**
 * Painel de comentários que sobe por cima do feed. Fica sempre montado para a
 * animação de entrada/saída existir — fechado ele é `translate-y-full` e não
 * recebe cliques.
 */
export function ComentariosPainel({ aberto, comentarios, onFechar, onEnviar }: Props) {
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const fimDaLista = useRef<HTMLDivElement>(null)

  // Esc fecha — no desktop é o gesto natural.
  useEffect(() => {
    if (!aberto) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [aberto, onFechar])

  // O comentário recém-enviado entra no fim da lista; rolar até ele evita a
  // impressão de que "não foi".
  useEffect(() => {
    if (aberto) fimDaLista.current?.scrollIntoView({ block: 'end' })
  }, [aberto, comentarios.length])

  async function enviar() {
    const t = texto.trim()
    if (!t || enviando) return
    setEnviando(true)
    await onEnviar(t)
    setTexto('')
    setEnviando(false)
  }

  return (
    <div className={`fixed inset-0 z-[70] ${aberto ? '' : 'pointer-events-none'}`} aria-hidden={!aberto}>
      <div
        onClick={onFechar}
        className={`absolute inset-0 bg-black/60 transition-opacity duration-300 ${aberto ? 'opacity-100' : 'opacity-0'}`}
      />

      <div
        role="dialog"
        aria-label="Comentários"
        className={`absolute inset-x-0 bottom-0 flex h-[68dvh] flex-col rounded-t-3xl bg-card shadow-2xl transition-transform duration-300 ease-out ${
          aberto ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        <div className="flex justify-center pb-1 pt-2.5">
          <span className="h-1 w-10 rounded-full bg-gray-600" aria-hidden />
        </div>

        <div className="flex items-center gap-2 border-b border-borda px-4 pb-2.5">
          <MessageCircle size={16} className="text-acento" />
          <p className="text-sm font-semibold text-white">
            {comentarios.length === 0
              ? 'Comentários'
              : `${contadorCurto(comentarios.length)} comentário${comentarios.length > 1 ? 's' : ''}`}
          </p>
          <button onClick={onFechar} className="ml-auto p-1 text-gray-400 transition hover:text-white" aria-label="Fechar comentários">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-2">
          {comentarios.length === 0 ? (
            <p className="py-10 text-center text-sm text-gray-500">
              Ninguém comentou ainda. Seja o primeiro.
            </p>
          ) : (
            <div className="flex flex-col gap-3.5 py-1">
              {comentarios.map(c => (
                <div key={c.id} className="flex gap-2.5">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-elevado text-xs font-bold text-gray-300">
                    {(c.cliente_nome || 'C').trim().charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-gray-400">
                      {c.cliente_nome || 'Cliente'} · {tempoDoPost(c.created_at)}
                    </p>
                    <p className="whitespace-pre-wrap break-words text-sm text-gray-200">{c.texto}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div ref={fimDaLista} />
        </div>

        {/* `pb-[env(safe-area-inset-bottom)]`: no iPhone a barra de gestos comeria
            o campo de digitação. */}
        <div className="flex gap-2 border-t border-borda p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <input
            value={texto}
            onChange={e => setTexto(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') enviar() }}
            maxLength={500}
            placeholder="Escreva um comentário..."
            className="flex-1 rounded-xl border border-borda bg-superficie px-3 py-2.5 text-sm text-white outline-none focus:border-acento/60"
          />
          <button
            onClick={enviar}
            disabled={!texto.trim() || enviando}
            className="shrink-0 rounded-xl bg-azul px-4 text-white transition hover:brightness-110 disabled:opacity-40"
            aria-label="Enviar comentário"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}
