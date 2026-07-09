'use client'
import { useEffect, useState } from 'react'

export type Tema = 'claro' | 'escuro'

export const TEMA_KEY = 'commerly:tema'

/** O `data-theme` do <html>; é ele que a paleta em globals.css observa. */
const ATRIBUTO: Record<Tema, string> = { claro: 'light', escuro: 'dark' }

/**
 * Tema do painel do comerciante, persistido no localStorage.
 *
 * O <html> já nasce com o `data-theme` certo — o script inline em layout.tsx roda
 * antes da primeira pintura. Aqui só reconciliamos o estado do React (que no
 * servidor não tem como saber a preferência) e gravamos as trocas.
 */
export function useTema() {
  const [tema, setTemaState] = useState<Tema>('escuro')

  // Pós-hidratação: alinha o estado ao que o script inline já aplicou.
  useEffect(() => {
    const salvo = typeof window !== 'undefined' ? localStorage.getItem(TEMA_KEY) : null
    if (salvo === 'claro' || salvo === 'escuro') setTemaState(salvo)
  }, [])

  function setTema(novo: Tema) {
    setTemaState(novo)
    document.documentElement.dataset.theme = ATRIBUTO[novo]
    try {
      localStorage.setItem(TEMA_KEY, novo)
    } catch {
      /* modo privado: o tema vale só para esta aba */
    }
  }

  const alternar = () => setTema(tema === 'claro' ? 'escuro' : 'claro')

  return { tema, setTema, alternar }
}
