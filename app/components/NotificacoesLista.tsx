'use client'
import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, CheckCheck } from 'lucide-react'
import { useNotificacoes } from '../hooks/useNotificacoes'
import {
  type Notificacao,
  EMOJI_NOTIFICACAO,
  CATEGORIAS_NOTIFICACAO,
  tiposDaCategoria,
  tempoRelativo,
} from '../lib/notificacoes'

// Histórico de notificações. Self-contained: assina o Realtime, lista tudo,
// marca como lida ao clicar (e navega) e tem "marcar todas como lidas".
// Reutilizado pelas páginas de comerciante, cliente e entregador.
//
// As abas filtram por categoria (ver CATEGORIAS_NOTIFICACAO). O filtro é feito
// no cliente sobre a lista que o hook já carregou — sem ida extra ao banco e
// sem perder o Realtime, que continua empurrando para a lista completa.
export function NotificacoesLista({ cor = 'green' }: { cor?: 'green' | 'blue' | 'orange' }) {
  const { notificacoes, carregando, marcarLida, marcarTodas } = useNotificacoes({ comLista: true })
  const [aba, setAba] = useState<string | null>(null) // null = "Todos"
  const router = useRouter()

  const acento = cor === 'blue' ? 'text-blue-400' : cor === 'orange' ? 'text-acento' : 'text-green-400'
  const ponto = cor === 'blue' ? 'bg-blue-500' : cor === 'orange' ? 'bg-acento' : 'bg-green-500'
  const chipAtivo = cor === 'blue' ? 'bg-blue-500 text-white' : cor === 'orange' ? 'bg-acento text-white' : 'bg-green-500 text-white'

  // Só mostra a aba que tem algo — uma fileira de categorias vazias é ruído.
  const abas = useMemo(() => {
    const presentes = new Set(notificacoes.map(n => n.tipo))
    return CATEGORIAS_NOTIFICACAO
      .filter(c => c.tipos.some(t => presentes.has(t)))
      .map(c => ({
        ...c,
        naoLidas: notificacoes.filter(n => !n.lida && (c.tipos as string[]).includes(n.tipo)).length,
      }))
  }, [notificacoes])

  const visiveis = useMemo(() => {
    const tipos = tiposDaCategoria(aba)
    if (!tipos) return notificacoes
    return notificacoes.filter(n => (tipos as string[]).includes(n.tipo))
  }, [notificacoes, aba])

  const naoLidasVisiveis = visiveis.filter(n => !n.lida).length
  const totalNaoLidas = notificacoes.filter(n => !n.lida).length

  async function abrir(n: Notificacao) {
    if (!n.lida) await marcarLida(n.id)
    if (n.link) router.push(n.link)
  }

  return (
    <div className="max-w-2xl">
      {abas.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto pb-2 mb-3 -mx-1 px-1">
          <button
            onClick={() => setAba(null)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition flex items-center gap-1.5 ${
              aba === null ? chipAtivo : 'bg-card border border-borda text-gray-400 hover:text-white'
            }`}
          >
            Todos
            {totalNaoLidas > 0 && (
              <span className={`px-1.5 rounded-full text-[10px] tabular-nums ${aba === null ? 'bg-black/25' : 'bg-white/10'}`}>
                {totalNaoLidas}
              </span>
            )}
          </button>
          {abas.map(c => (
            <button
              key={c.id}
              onClick={() => setAba(c.id)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition flex items-center gap-1.5 ${
                aba === c.id ? chipAtivo : 'bg-card border border-borda text-gray-400 hover:text-white'
              }`}
            >
              {c.label}
              {c.naoLidas > 0 && (
                <span className={`px-1.5 rounded-full text-[10px] tabular-nums ${aba === c.id ? 'bg-black/25' : 'bg-white/10'}`}>
                  {c.naoLidas}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {naoLidasVisiveis > 0 && (
        <div className="flex justify-end mb-3">
          <button
            onClick={() => marcarTodas(tiposDaCategoria(aba))}
            className="text-xs text-gray-400 hover:text-white flex items-center gap-1.5 transition"
          >
            <CheckCheck size={14} />
            {aba ? `Marcar ${abas.find(c => c.id === aba)?.label} como lidas` : 'Marcar todas como lidas'}
          </button>
        </div>
      )}

      {carregando ? (
        <p className="text-gray-500 text-sm">Carregando...</p>
      ) : visiveis.length === 0 ? (
        <div className="bg-card border border-borda rounded-2xl p-8 text-center">
          <Bell size={38} className="text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400 text-sm">
            {aba ? 'Nada nesta categoria.' : 'Você ainda não tem notificações.'}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {visiveis.map((n) => (
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
