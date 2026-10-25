'use client'
import { useEffect, useState } from 'react'
import type { Flags } from './featureFlags'

// Cache em memória entre componentes (evita refetch a cada montagem no cliente).
// Vence em TTL_MS: antes ele durava a sessão inteira da aba, e uma chave
// desligada no admin só sumia da tela depois de um F5. O bloqueio de verdade é
// no servidor (rota 503 / banco); isto só faz a tela acompanhar.
const TTL_MS = 60_000
let cache: Flags | null = null
let cacheEm = 0
let pendente: Promise<Flags> | null = null
const ouvintes = new Set<(f: Flags) => void>()

function fresco(): boolean {
  return !!cache && Date.now() - cacheEm < TTL_MS
}

async function buscar(): Promise<Flags> {
  if (fresco()) return cache!
  if (!pendente) {
    pendente = fetch('/api/flags', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        // Falha de rede/servidor não apaga o que já se sabia.
        if (d?.flags) { cache = d.flags as Flags; cacheEm = Date.now() }
        const f = cache || {}
        ouvintes.forEach(o => o(f))
        return f
      })
      .catch(() => cache || ({} as Flags))
      .finally(() => { pendente = null })
  }
  return pendente
}

/**
 * Hook de feature flags do usuário logado. Enquanto carrega, `pronto` é false
 * e as flags padrão para true (não esconde nada antes de saber). Relê ao
 * voltar o foco para a aba quando o cache venceu.
 */
export function useFlags() {
  const [flags, setFlags] = useState<Flags>(cache || {})
  const [pronto, setPronto] = useState<boolean>(!!cache)

  useEffect(() => {
    let vivo = true
    const aplicar = (f: Flags) => { if (vivo) { setFlags(f); setPronto(true) } }
    ouvintes.add(aplicar)
    buscar().then(aplicar)
    const aoVoltar = () => { if (document.visibilityState === 'visible' && !fresco()) buscar() }
    document.addEventListener('visibilitychange', aoVoltar)
    return () => {
      vivo = false
      ouvintes.delete(aplicar)
      document.removeEventListener('visibilitychange', aoVoltar)
    }
  }, [])

  // Enquanto não sabemos, tudo ligado; depois, respeita o banco (default true).
  const ativa = (flag: string): boolean => (pronto ? flags[flag] ?? true : true)
  return { flags, pronto, ativa }
}
