'use client'
import { useEffect } from 'react'
import { createClient } from '../supabase'

// Ativa as notificações push nativas (PWA) para o usuário logado.
// Montado no layout raiz: em toda navegação autenticada, garante o service
// worker, pede permissão de notificação (uma vez) e registra/atualiza a push
// subscription no servidor (/api/push/subscribe). Em páginas públicas (sem
// login) não faz nada — não incomoda visitantes com o prompt.

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY

// A applicationServerKey precisa ser Uint8Array (base64url -> bytes).
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

export default function PushManager() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return
    if (!VAPID_PUBLIC) return
    // O service worker só é registrado em produção (ver PWARegister). Sem SW,
    // não há push — evita erros barulhentos em dev.
    if (process.env.NODE_ENV !== 'production') return

    let cancelado = false
    const supabase = createClient()

    async function ativar() {
      // 1) Só age se houver usuário logado.
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || cancelado) return

      // 2) Permissão. Se já negou, respeita e não insiste.
      if (Notification.permission === 'denied') return
      if (Notification.permission === 'default') {
        const perm = await Notification.requestPermission()
        if (perm !== 'granted' || cancelado) return
      }

      // 3) Garante o service worker pronto e (re)cria a subscription.
      const reg = await navigator.serviceWorker.ready
      let sub = await reg.pushManager.getSubscription()
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC!),
        })
      }
      if (cancelado) return

      // 4) Persiste no servidor (upsert por endpoint). Reenvia a cada montagem
      //    para reassociar ao user atual (ex.: trocou de conta no dispositivo).
      //
      //    O `.catch(() => {})` que existia aqui escondeu por semanas um 500 da
      //    rota (coluna faltando no banco): o navegador criava a subscription,
      //    o servidor recusava e ninguém ficava sabendo — nenhum push nativo
      //    jamais saiu. Falhar continua sendo silencioso para o USUÁRIO (não há
      //    o que ele faça), mas nunca mais para o console.
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: sub.toJSON() }),
      }).catch((e) => {
        console.warn('[push] falha de rede ao registrar a inscrição:', e)
        return null
      })
      if (res && !res.ok) {
        console.warn('[push] servidor recusou a inscrição:', res.status, await res.text().catch(() => ''))
      }
    }

    ativar().catch((err) => console.warn('[push] não foi possível ativar:', err))
    return () => { cancelado = true }
  }, [])

  return null
}
