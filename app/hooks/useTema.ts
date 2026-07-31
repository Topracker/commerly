'use client'
import { useEffect, useState } from 'react'

export type Tema = 'claro' | 'escuro'
export type Acento = 'verde' | 'azul' | 'roxo' | 'laranja' | 'vermelho'

export const TEMA_KEY = 'commerly:tema'
export const ACENTO_KEY = 'commerly:acento'
export const BRILHO_KEY = 'commerly:brilho'

/** O `data-theme` do <html>; é ele que a paleta em globals.css observa. */
const ATRIBUTO: Record<Tema, string> = { claro: 'light', escuro: 'dark' }

// Cores de destaque disponíveis. Cada acento tem uma versão para o tema escuro e
// outra para o claro (contraste), além da tinta que fica POR CIMA do acento
// (texto de botões). Ver a regra `--tinta-acento` em globals.css.
type Trio = { bg: string; forte: string; tinta: string }
export const ACENTOS: Record<Acento, { rotulo: string; amostra: string; escuro: Trio; claro: Trio }> = {
  verde:    { rotulo: 'Verde',    amostra: '#00c896', escuro: { bg: '#00c896', forte: '#00a97e', tinta: '#04231d' }, claro: { bg: '#00815f', forte: '#00694d', tinta: '#ffffff' } },
  azul:     { rotulo: 'Azul',     amostra: '#2f6bff', escuro: { bg: '#2f6bff', forte: '#1f57e6', tinta: '#ffffff' }, claro: { bg: '#0052cc', forte: '#0043a6', tinta: '#ffffff' } },
  roxo:     { rotulo: 'Roxo',     amostra: '#a855f7', escuro: { bg: '#a855f7', forte: '#9333ea', tinta: '#ffffff' }, claro: { bg: '#7c3aed', forte: '#6d28d9', tinta: '#ffffff' } },
  laranja:  { rotulo: 'Laranja',  amostra: '#fb923c', escuro: { bg: '#fb923c', forte: '#f97316', tinta: '#3a1a02' }, claro: { bg: '#c2410c', forte: '#9a3412', tinta: '#ffffff' } },
  vermelho: { rotulo: 'Vermelho', amostra: '#f05252', escuro: { bg: '#f05252', forte: '#e02424', tinta: '#ffffff' }, claro: { bg: '#dc2626', forte: '#b91c1c', tinta: '#ffffff' } },
}

export const BRILHO_MIN = 0.8
export const BRILHO_MAX = 1.15

function acentoValido(v: string | null): Acento {
  return v && v in ACENTOS ? (v as Acento) : 'verde'
}
function brilhoValido(v: string | null): number {
  // `Number(null)` e `Number('')` valem 0 — que é finito e seria arrastado até
  // BRILHO_MIN pelo clamp. Quem nunca mexeu no brilho veria "80%" num app que
  // na prática está em 100%.
  if (v == null || v.trim() === '') return 1
  const n = Number(v)
  if (!Number.isFinite(n)) return 1
  return Math.min(BRILHO_MAX, Math.max(BRILHO_MIN, n))
}

/** Aplica acento (conforme o tema atual) nas CSS vars do <html>. */
function aplicarAcento(acento: Acento, tema: Tema) {
  const trio = tema === 'claro' ? ACENTOS[acento].claro : ACENTOS[acento].escuro
  const s = document.documentElement.style
  s.setProperty('--color-acento', trio.bg)
  s.setProperty('--color-acento-forte', trio.forte)
  s.setProperty('--tinta-acento', trio.tinta)
}

function aplicarBrilho(brilho: number) {
  document.documentElement.style.filter = brilho === 1 ? '' : `brightness(${brilho})`
}

/**
 * Preferências de aparência do usuário (qualquer papel), persistidas no
 * localStorage. Cobre tema claro/escuro, cor de destaque e brilho.
 *
 * O <html> já nasce com o tema/acento/brilho certos — o script inline em
 * layout.tsx roda antes da primeira pintura. Aqui reconciliamos o estado do
 * React (que no servidor não conhece a preferência) e gravamos as trocas.
 */
export function useTema() {
  const [tema, setTemaState] = useState<Tema>('escuro')
  const [acento, setAcentoState] = useState<Acento>('verde')
  const [brilho, setBrilhoState] = useState<number>(1)

  // Pós-hidratação: alinha o estado ao que o script inline já aplicou.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const salvo = localStorage.getItem(TEMA_KEY)
    if (salvo === 'claro' || salvo === 'escuro') setTemaState(salvo)
    setAcentoState(acentoValido(localStorage.getItem(ACENTO_KEY)))
    setBrilhoState(brilhoValido(localStorage.getItem(BRILHO_KEY)))
  }, [])

  function setTema(novo: Tema) {
    setTemaState(novo)
    document.documentElement.dataset.theme = ATRIBUTO[novo]
    // O acento muda de valor entre claro/escuro — reaplica pro tema novo.
    aplicarAcento(acento, novo)
    try { localStorage.setItem(TEMA_KEY, novo) } catch { /* modo privado */ }
  }

  function setAcento(novo: Acento) {
    setAcentoState(novo)
    aplicarAcento(novo, tema)
    try { localStorage.setItem(ACENTO_KEY, novo) } catch {}
  }

  function setBrilho(novo: number) {
    const v = Math.min(BRILHO_MAX, Math.max(BRILHO_MIN, novo))
    setBrilhoState(v)
    aplicarBrilho(v)
    try { localStorage.setItem(BRILHO_KEY, String(v)) } catch {}
  }

  const alternar = () => setTema(tema === 'claro' ? 'escuro' : 'claro')

  return { tema, setTema, alternar, acento, setAcento, brilho, setBrilho }
}
