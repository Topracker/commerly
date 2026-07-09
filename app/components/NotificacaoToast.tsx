'use client'
import { useRouter } from 'next/navigation'
import { Bell, X } from 'lucide-react'
import { type Notificacao, EMOJI_NOTIFICACAO } from '../lib/notificacoes'

// Popup que aparece no topo quando chega uma notificação em tempo real.
// Clicar navega para o link da notificação. Distinto do <Toast> genérico
// (sucesso/erro) — este mostra título + mensagem e um ícone de sino.
export function NotificacaoToast({
  notif,
  onFechar,
}: {
  notif: Notificacao | null
  onFechar: () => void
}) {
  const router = useRouter()
  if (!notif) return null

  function abrir() {
    onFechar()
    if (notif!.link) router.push(notif!.link)
  }

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] w-[calc(100%-2rem)] max-w-sm animate-[slideDown_0.25s_ease-out]">
      <div
        role="button"
        tabIndex={0}
        onClick={abrir}
        onKeyDown={(e) => { if (e.key === 'Enter') abrir() }}
        className="cursor-pointer bg-card border border-[#2b3440] rounded-2xl shadow-2xl shadow-black/50 p-3.5 flex items-start gap-3 hover:border-green-500/50 transition"
      >
        <div className="w-10 h-10 rounded-xl bg-green-500/15 flex items-center justify-center shrink-0 text-lg">
          <span aria-hidden>{EMOJI_NOTIFICACAO[notif.tipo] ?? '🔔'}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <Bell size={12} className="text-green-400 shrink-0" />
            <p className="text-white font-semibold text-sm truncate">{notif.titulo}</p>
          </div>
          <p className="text-gray-400 text-xs line-clamp-2">{notif.mensagem}</p>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onFechar() }}
          aria-label="Fechar"
          className="shrink-0 text-gray-500 hover:text-white transition -mt-1 -mr-1 p-1"
        >
          <X size={16} />
        </button>
      </div>
      <style jsx>{`
        @keyframes slideDown {
          from { opacity: 0; transform: translate(-50%, -12px); }
          to { opacity: 1; transform: translate(-50%, 0); }
        }
      `}</style>
    </div>
  )
}
