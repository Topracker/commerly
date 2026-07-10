'use client'
import { useEffect } from 'react'

export default function PWARegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator)) return
    if (process.env.NODE_ENV !== 'production') return

    // "Atualizei mas o cliente vê a tela antiga": quando um SW NOVO assume o
    // controle de uma página que já era controlada, recarregamos uma vez para
    // carregar o bundle atualizado. Só anexamos se já houver controlador — no
    // primeiríssimo acesso não há, e reagir ali causaria reload loop.
    let recarregando = false
    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (recarregando) return
        recarregando = true
        window.location.reload()
      })
    }

    const onLoad = () => {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .then((reg) => {
          // Procura ativamente por uma versão nova a cada carga (sem isto, o
          // browser só revalida o sw.js esporadicamente).
          reg.update().catch(() => {})
        })
        .catch((err) => {
          console.warn('[pwa] falha ao registrar service worker:', err)
        })
    }

    if (document.readyState === 'complete') {
      onLoad()
    } else {
      window.addEventListener('load', onLoad, { once: true })
      return () => window.removeEventListener('load', onLoad)
    }
  }, [])

  return null
}
