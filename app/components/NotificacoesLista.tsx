'use client'
import { useRouter } from 'next/navigation'
import { Bell, CheckCheck } from 'lucide-react'
import { useNotificacoes } from '../hooks/useNotificacoes'
import { type Notificacao, EMOJI_NOTIFICACAO, tempoRelativo } from '../lib/notificacoes'

// Histórico de notificações. Self-contained: assina o Realtime, lista tudo,
// marca como lida ao clicar (e navega) e tem "marcar todas como lidas".
// Reutilizado pelas páginas de comerciante, cliente e entregador.
export function NotificacoesLista({ cor = 'green' }: { cor?: 'green' | 'blue' | 'orange' }) {
  const { notificacoes, carregando, naoLidas, marcarLida, marcarTodas } = useNotificacoes({ comLista: true })
  const router = useRouter()

  const acento = cor === 'blue' ? 'text-blue-400' : cor === 'orange' ? 'text-acento' : 'text-green-400'
  const ponto = cor === 'blue' ? 'bg-blue-500' : cor === 'orange' ? 'bg-acento' : 'bg-green-500'

  async function abrir(n: Notificacao) {
    if (!n.lida) await marcarLida(n.id)
    if (n.link) router.push(n.link)
  }

  return (
    <div className="max-w-2xl">
      {naoLidas > 0 && (
        <div className="flex justify-end mb-3">
          <button
            onClick={() => marcarTodas()}
            className="text-xs text-gray-400 hover:text-white flex items-center gap-1.5 transition"
          >
            <CheckCheck size={14} /> Marcar todas como lidas
          </button>
        </div>
      )}

      {carregando ? (
        <p className="text-gray-500 text-sm">Carregando...</p>
      ) : notificacoes.length === 0 ? (
        <div className="bg-card border border-borda rounded-2xl p-8 text-center">
          <Bell size={38} className="text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400 text-sm">Você ainda não tem notificações.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {notificacoes.map((n) => (
            <button
              key={n.id}
              onClick={() => abrir(n)}
              className={`w-full text-left rounded-2xl p-4 flex items-start gap-3 transition border ${
                n.lida
                  ? 'bg-card border-borda hover:bg-superficie'
                  : 'bg-[#161B22] border-[#2b3440] hover:bg-elevado'
              }`}
            >
              <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center shrink-0 text-lg">
                <span aria-hidden>{EMOJI_NOTIFICACAO[n.tipo] ?? '🔔'}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-white font-semibold text-sm truncate">{n.titulo}</p>
                  {!n.lida && <span className={`w-2 h-2 rounded-full shrink-0 ${ponto}`} />}
                </div>
                <p className="text-gray-400 text-sm mt-0.5">{n.mensagem}</p>
                <p className={`text-xs mt-1 ${acento}`}>{tempoRelativo(n.created_at)}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
