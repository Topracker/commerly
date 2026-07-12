'use client'
import { useEffect, useState } from 'react'
import type { Flags } from './featureFlags'

// Cache em memória entre componentes (evita refetch a cada montagem no cliente).
let cache: Flags | null = null
let pendente: Promise<Flags> | null = null

async function buscar(): Promise<Flags> {
  if (cache) return cache
  if (!pendente) {
    pendente = fetch('/api/flags')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { cache = (d?.flags as Flags) || {}; return cache })
      .catch(() => ({} as Flags))
      .finally(() => { pendente = null })
  }
  return pendente
}

/**
 * Hook de feature flags do usuário logado. Enquanto carrega, `pronto` é false
 * e as flags padrão para true (não esconde nada antes de saber).
 */
export function useFlags() {
  const [flags, setFlags] = useState<Flags>(cache || {})
  const [pronto, setPronto] = useState<boolean>(!!cache)

  useEffect(() => {
    let vivo = true
    buscar().then(f => { if (vivo) { setFlags(f); setPronto(true) } })
    return () => { vivo = false }
  }, [])

  // Enquanto não sabemos, tudo ligado; depois, respeita o banco (default true).
  const ativa = (flag: string): boolean => (pronto ? flags[flag] ?? true : true)
  return { flags, pronto, ativa }
}
