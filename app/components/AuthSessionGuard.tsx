'use client'
import { useEffect } from 'react'

// Quando o navegador guarda uma sessão antiga cujo refresh token já foi
// revogado/rotacionado, o auto-refresh do supabase-js dispara sozinho na
// inicialização do client e falha com "Invalid Refresh Token". O supabase já
// limpa a sessão inválida por conta própria — o único efeito colateral é o
// erro barulhento que ele imprime no console (via console.error e, em algumas
// versões, como promise rejeitada). Isto é esperado e inofensivo, então
// silenciamos SÓ essa mensagem específica, deixando qualquer outro erro passar.
const ehRuidoRefreshInvalido = (valor: unknown): boolean => {
  const e = valor as { name?: string; message?: string; code?: string; __isAuthError?: boolean } | null
  if (e && typeof e === 'object') {
    const nomeAuth = e.name === 'AuthApiError' || e.__isAuthError === true
    const codigoAuth = e.code === 'refresh_token_not_found'
    if ((nomeAuth || codigoAuth) && /refresh token/i.test(e.message || '')) return true
  }
  if (typeof valor === 'string') return /auth.*refresh token|refresh token.*(not|is not) (valid|found)/i.test(valor)
  return false
}

export default function AuthSessionGuard() {
  useEffect(() => {
    if (typeof window === 'undefined') return

    // 1) Alguns caminhos do supabase-js rejeitam a promise do refresh.
    const onRejection = (ev: PromiseRejectionEvent) => {
      if (ehRuidoRefreshInvalido(ev.reason)) ev.preventDefault()
    }
    window.addEventListener('unhandledrejection', onRejection)

    // 2) O caminho principal apenas chama console.error com o AuthApiError.
    const erroOriginal = console.error
    console.error = (...args: unknown[]) => {
      if (args.some(ehRuidoRefreshInvalido)) return
      erroOriginal.apply(console, args as [])
    }

    return () => {
      window.removeEventListener('unhandledrejection', onRejection)
      console.error = erroOriginal
    }
  }, [])

  return null
}
