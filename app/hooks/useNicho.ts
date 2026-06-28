'use client'
import { useEffect, useState } from 'react'
import { getNicho, resolverModulos, NICHOS, type Modulo, type Nicho } from '../lib/nichos'
import { carregarNichoCustom } from '../lib/nicheStore'

/**
 * Resolve o nicho de uma loja (config estática) + os módulos personalizados.
 * Para tipos custom ("Outro"), busca a seleção salva pela IA de onboarding no
 * localStorage — feito em useEffect pra não quebrar a hidratação do SSR.
 */
export function useNicho(loja: any): { nicho: Nicho; modulos: Modulo[] } {
  const tipo: string | undefined = loja?.tipo
  const lojaId: string | undefined = loja?.id
  const conhecido = !!tipo && tipo in NICHOS

  const [modulos, setModulos] = useState<Modulo[]>(() => resolverModulos(tipo))

  useEffect(() => {
    if (!lojaId) return
    // Nicho conhecido: módulos vêm direto da config estática.
    if (conhecido) { setModulos(resolverModulos(tipo)); return }
    // Tipo custom: aplica a seleção da IA, se existir.
    const custom = carregarNichoCustom(lojaId)
    setModulos(resolverModulos(tipo, custom?.modulos))
  }, [lojaId, tipo, conhecido])

  return { nicho: getNicho(tipo), modulos }
}
