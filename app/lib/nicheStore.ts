'use client'
import type { ModuloKey } from './nichos'

// ───────────────────────────────────────────────────────────────────────────
// Persistência local dos módulos de nicho (agenda, serviços e a seleção custom
// da IA de onboarding), isolada por loja.
//
// Hoje grava em localStorage — o backend (Supabase) ainda não tem as tabelas
// `agendamentos` / `servicos` nem a coluna `nicho_modulos`. Toda leitura/escrita
// passa por aqui, então migrar pra Supabase depois é trocar só este arquivo.
// (O SQL sugerido está no resumo da entrega.)
// ───────────────────────────────────────────────────────────────────────────

const PREFIX = 'commerly:nicho'

function ler<T>(chave: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = window.localStorage.getItem(chave)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function gravar(chave: string, valor: unknown) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(chave, JSON.stringify(valor))
  } catch {
    /* quota cheia / modo privado — ignora silenciosamente */
  }
}

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

// ── Nicho custom (IA de onboarding para "Outro") ───────────────────────────

export type NichoCustom = {
  tipo: string
  descricao: string
  modulos: ModuloKey[]
  criadoEm: string
}

export function carregarNichoCustom(lojaId: string): NichoCustom | null {
  return ler<NichoCustom | null>(`${PREFIX}:custom:${lojaId}`, null)
}

export function salvarNichoCustom(lojaId: string, dados: Omit<NichoCustom, 'criadoEm'>) {
  gravar(`${PREFIX}:custom:${lojaId}`, { ...dados, criadoEm: new Date().toISOString() })
}

// ── Agendamentos ───────────────────────────────────────────────────────────

export type Agendamento = {
  id: string
  cliente: string
  servico: string
  data: string   // 'YYYY-MM-DD'
  hora: string   // 'HH:MM'
  telefone?: string
  obs?: string
  status: 'agendado' | 'concluido' | 'cancelado'
  criadoEm: string
}

export function carregarAgendamentos(lojaId: string): Agendamento[] {
  const lista = ler<Agendamento[]>(`${PREFIX}:agenda:${lojaId}`, [])
  return [...lista].sort((a, b) => (a.data + a.hora).localeCompare(b.data + b.hora))
}

export function salvarAgendamento(lojaId: string, ag: Omit<Agendamento, 'id' | 'criadoEm'> & { id?: string }): Agendamento[] {
  const lista = ler<Agendamento[]>(`${PREFIX}:agenda:${lojaId}`, [])
  if (ag.id) {
    const i = lista.findIndex(a => a.id === ag.id)
    if (i >= 0) lista[i] = { ...lista[i], ...ag, id: ag.id }
  } else {
    lista.push({ ...ag, id: uid(), criadoEm: new Date().toISOString() })
  }
  gravar(`${PREFIX}:agenda:${lojaId}`, lista)
  return carregarAgendamentos(lojaId)
}

export function removerAgendamento(lojaId: string, id: string): Agendamento[] {
  const lista = ler<Agendamento[]>(`${PREFIX}:agenda:${lojaId}`, []).filter(a => a.id !== id)
  gravar(`${PREFIX}:agenda:${lojaId}`, lista)
  return carregarAgendamentos(lojaId)
}

// ── Serviços ────────────────────────────────────────────────────────────────

export type Servico = {
  id: string
  nome: string
  preco: number
  duracao: number // minutos
  criadoEm: string
}

export function carregarServicos(lojaId: string): Servico[] {
  const lista = ler<Servico[]>(`${PREFIX}:servicos:${lojaId}`, [])
  return [...lista].sort((a, b) => a.nome.localeCompare(b.nome))
}

export function salvarServico(lojaId: string, s: Omit<Servico, 'id' | 'criadoEm'> & { id?: string }): Servico[] {
  const lista = ler<Servico[]>(`${PREFIX}:servicos:${lojaId}`, [])
  if (s.id) {
    const i = lista.findIndex(x => x.id === s.id)
    if (i >= 0) lista[i] = { ...lista[i], ...s, id: s.id }
  } else {
    lista.push({ ...s, id: uid(), criadoEm: new Date().toISOString() })
  }
  gravar(`${PREFIX}:servicos:${lojaId}`, lista)
  return carregarServicos(lojaId)
}

export function removerServico(lojaId: string, id: string): Servico[] {
  const lista = ler<Servico[]>(`${PREFIX}:servicos:${lojaId}`, []).filter(s => s.id !== id)
  gravar(`${PREFIX}:servicos:${lojaId}`, lista)
  return carregarServicos(lojaId)
}
