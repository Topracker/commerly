'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { usePathname } from 'next/navigation'
import { createClient } from '../supabase'
import {
  type Notificacao,
  type TipoNotificacao,
  listarNotificacoes,
  contarNaoLidas,
  marcarComoLida,
  marcarTodasComoLidas,
  tocarSomNotificacao,
} from '../lib/notificacoes'

type Opcoes = {
  // Carrega a lista completa (páginas de histórico). O layout só precisa do
  // contador, então mantém false por padrão (mais leve).
  comLista?: boolean
}

/**
 * Assina as notificações do usuário logado em tempo real (Supabase Realtime).
 * Retorna o contador de não lidas, a lista (se pedida) e as ações de marcar
 * como lida. A cada nova notificação: toca um som e expõe `toastNotif` (o
 * layout mostra o popup). Reconta ao trocar de rota, como os demais badges.
 */
export function useNotificacoes({ comLista = false }: Opcoes = {}) {
  const [supabase] = useState(() => createClient())
  const [userId, setUserId] = useState<string | null>(null)
  const [naoLidas, setNaoLidas] = useState(0)
  const [notificacoes, setNotificacoes] = useState<Notificacao[]>([])
  const [carregando, setCarregando] = useState(comLista)
  const [toastNotif, setToastNotif] = useState<Notificacao | null>(null)
  const pathname = usePathname()
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const recarregar = useCallback(async () => {
    const [n, lista] = await Promise.all([
      contarNaoLidas(supabase),
      comLista ? listarNotificacoes(supabase) : Promise.resolve(null),
    ])
    setNaoLidas(n)
    if (lista) setNotificacoes(lista)
    setCarregando(false)
  }, [supabase, comLista])

  // Descobre o destinatário (auth user) e assina o Realtime uma vez.
  useEffect(() => {
    let canal: any = null
    let ativo = true
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || !ativo) return
      setUserId(user.id)
      await recarregar()

      canal = supabase
        .channel(`notificacoes:${user.id}:${Math.random().toString(36).slice(2)}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'notificacoes', filter: `user_id=eq.${user.id}` },
          (payload: any) => {
            const nova = payload.new as Notificacao
            setNotificacoes(prev => [nova, ...prev])
            setNaoLidas(c => c + 1)
            tocarSomNotificacao()
            setToastNotif(nova)
            if (toastTimer.current) clearTimeout(toastTimer.current)
            toastTimer.current = setTimeout(() => setToastNotif(null), 6000)
          },
        )
        .subscribe()
    })()
    return () => {
      ativo = false
      if (canal) supabase.removeChannel(canal)
      if (toastTimer.current) clearTimeout(toastTimer.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase])

  // Reconta ao navegar (ex.: depois de abrir a página e marcar como lidas).
  useEffect(() => {
    if (userId) recarregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  const marcarLida = useCallback(async (id: string) => {
    setNotificacoes(prev => prev.map(n => (n.id === id ? { ...n, lida: true } : n)))
    setNaoLidas(c => Math.max(0, c - 1))
    await marcarComoLida(supabase, id)
  }, [supabase])

  // Sem `tipos` marca tudo; com `tipos` marca só a categoria da aba aberta.
  const marcarTodas = useCallback(async (tipos?: TipoNotificacao[] | null) => {
    const alvo = tipos && tipos.length > 0 ? new Set<string>(tipos) : null
    setNotificacoes(prev => prev.map(n => (!alvo || alvo.has(n.tipo) ? { ...n, lida: true } : n)))
    setNaoLidas(c => {
      if (!alvo) return 0
      const restam = notificacoes.filter(n => !n.lida && !alvo.has(n.tipo)).length
      return restam
    })
    await marcarTodasComoLidas(supabase, tipos)
  }, [supabase, notificacoes])

  const fecharToast = useCallback(() => setToastNotif(null), [])

  return { userId, naoLidas, notificacoes, carregando, recarregar, marcarLida, marcarTodas, toastNotif, fecharToast }
}
