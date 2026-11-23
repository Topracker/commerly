'use client'
import { useEffect } from 'react'
import { ehAppNativo, pluginNativo } from '../lib/nativo'

// Só age dentro do app Android nativo. O login com Google abre no navegador
// do sistema (o Google bloqueia login dentro de WebView); ao terminar, o
// Google/Supabase redireciona para https://commerly.com.br/auth/callback, que
// o Android entrega de volta ao app (App Link verificado pelo assetlinks.json).
// Aqui pegamos essa URL e a abrimos DENTRO do WebView — é onde está o cookie
// do PKCE — para o /auth/callback trocar o code pela sessão.
const CHAVE = 'commerly:ultimoAppLink'

function abrirNoApp(url: string | undefined) {
  if (!url) return
  let alvo: URL
  try { alvo = new URL(url) } catch { return }
  if (alvo.hostname !== 'commerly.com.br' || !alvo.pathname.startsWith('/auth/callback')) return
  // Evita loop: a mesma URL de lançamento volta em getLaunchUrl a cada página.
  try {
    if (sessionStorage.getItem(CHAVE) === url) return
    sessionStorage.setItem(CHAVE, url)
  } catch { /* sem storage: segue */ }
  pluginNativo('Browser')?.close?.()?.catch?.(() => {})
  window.location.href = alvo.pathname + alvo.search
}

export default function NativeBridge() {
  useEffect(() => {
    if (!ehAppNativo()) return
    const App = pluginNativo('App')
    if (!App) return
    let handle: { remove?: () => void } | undefined
    Promise.resolve(App.addListener?.('appUrlOpen', (e: { url?: string }) => abrirNoApp(e?.url)))
      .then(h => { handle = h })
      .catch(() => {})
    Promise.resolve(App.getLaunchUrl?.())
      .then((r: { url?: string } | undefined) => abrirNoApp(r?.url))
      .catch(() => {})
    return () => { handle?.remove?.() }
  }, [])
  return null
}
