'use client'
import { createClient } from '../supabase'
import type { ModuloKey } from './nichos'

// ───────────────────────────────────────────────────────────────────────────
// Persistência dos módulos de nicho.
//
// - Agendamentos e serviços: tabelas no Supabase (`agendamentos`, `servicos`),
//   protegidas por RLS via loja_id, no mesmo padrão de produtos/vendas.
// - Nicho custom (seleção da IA de onboarding para "Outro"): continua em
//   localStorage, pois não tem tabela dedicada — é só uma preferência de UI.
// ───────────────────────────────────────────────────────────────────────────

const supabase = createClient()

// ── Nicho custom (IA de onboarding para "Outro") — localStorage ────────────

export type NichoCustom = {
  tipo: string
  descricao: string
  modulos: ModuloKey[]
  criadoEm: string
}

const CUSTOM_PREFIX = 'commerly:nicho:custom'

export function carregarNichoCustom(lojaId: string): NichoCustom | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(`${CUSTOM_PREFIX}:${lojaId}`)
    return raw ? (JSON.parse(raw) as NichoCustom) : null
  } catch {
    return null
  }
}

export function salvarNichoCustom(lojaId: string, dados: Omit<NichoCustom, 'criadoEm'>) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(
      `${CUSTOM_PREFIX}:${lojaId}`,
      JSON.stringify({ ...dados, criadoEm: new Date().toISOString() }),
    )
  } catch {
    /* quota cheia / modo privado — ignora */
  }
}

// ── Agendamentos (Supabase) ─────────────────────────────────────────────────

export type StatusAgendamento = 'agendado' | 'concluido' | 'cancelado'

export type Agendamento = {
  id: string
  cliente: string
  servico: string
  data: string   // 'YYYY-MM-DD'
  hora: string   // 'HH:MM'
  telefone?: string | null
  obs?: string | null
  status: StatusAgendamento
  created_at?: string
}

export type AgendamentoInput = {
  id?: string
  cliente: string
  servico: string
  data: string
  hora: string
  telefone?: string | null
  obs?: string | null
  status: StatusAgendamento
}

function ordenarAgenda(lista: Agendamento[]): Agendamento[] {
  return [...lista].sort((a, b) => (a.data + a.hora).localeCompare(b.data + b.hora))
}

export async function carregarAgendamentos(lojaId: string): Promise<Agendamento[]> {
  const { data, error } = await supabase
    .from('agendamentos')
    .select('*')
    .eq('loja_id', lojaId)
  if (error) throw error
  return ordenarAgenda((data || []) as Agendamento[])
}

export async function salvarAgendamento(lojaId: string, ag: AgendamentoInput): Promise<Agendamento[]> {
  // Só colunas editáveis — id/created_at ficam por conta do banco.
  const payload = {
    cliente: ag.cliente,
    servico: ag.servico,
    data: ag.data,
    hora: ag.hora,
    telefone: ag.telefone ?? null,
    obs: ag.obs ?? null,
    status: ag.status,
    // Coluna legada `data_hora` (timestamp) segue NOT NULL em produção — a DDL
    // de schema que a torna nullable ainda não foi aplicada (ver
    // sql/2026-07-06-fix-agenda-servicos-schema.sql). Sem preenchê-la, todo
    // insert falha com 23502. Derivamos de data+hora; continua compatível
    // depois que a migration rodar (a coluna só passa a ser nullable).
    data_hora: `${ag.data} ${ag.hora}:00`,
  }
  const { error } = ag.id
    ? await supabase.from('agendamentos').update(payload).eq('id', ag.id).eq('loja_id', lojaId)
    : await supabase.from('agendamentos').insert({ ...payload, loja_id: lojaId })
  if (error) throw error
  return carregarAgendamentos(lojaId)
}

export async function removerAgendamento(lojaId: string, id: string): Promise<Agendamento[]> {
  const { error } = await supabase.from('agendamentos').delete().eq('id', id).eq('loja_id', lojaId)
  if (error) throw error
  return carregarAgendamentos(lojaId)
}

// ── Lembretes de agendamento (próximas horas) ───────────────────────────────

/** Minutos (arredondados) daqui até o horário do agendamento. Negativo = já passou. */
export function minutosAteAgendamento(ag: Pick<Agendamento, 'data' | 'hora'>): number {
  const alvo = new Date(`${ag.data}T${ag.hora}:00`)
  return Math.round((alvo.getTime() - Date.now()) / 60000)
}

/**
 * Agendamentos com status 'agendado' que começam dentro dos próximos
 * `janelaMin` minutos (padrão 120 = 2h), do dia de hoje. Ordenados por horário.
 * Usado no card de lembrete do dashboard e no badge do menu Agenda.
 */
export async function carregarAgendamentosProximos(lojaId: string, janelaMin = 120): Promise<Agendamento[]> {
  const hojeIso = new Date().toLocaleDateString('sv-SE') // YYYY-MM-DD local
  const { data, error } = await supabase
    .from('agendamentos')
    .select('*')
    .eq('loja_id', lojaId)
    .eq('data', hojeIso)
    .eq('status', 'agendado')
  if (error) throw error
  return ordenarAgenda((data || []) as Agendamento[])
    .filter(a => {
      const m = minutosAteAgendamento(a)
      // -5 de folga: um agendamento que acabou de começar ainda aparece como
      // "agora" (não some no minuto exato do horário por arredondamento).
      return m >= -5 && m <= janelaMin
    })
}

// ── Serviços (Supabase) ─────────────────────────────────────────────────────

export type Servico = {
  id: string
  nome: string
  preco: number
  duracao: number // minutos
  created_at?: string
}

export type ServicoInput = {
  id?: string
  nome: string
  preco: number
  duracao: number
}

export async function carregarServicos(lojaId: string): Promise<Servico[]> {
  const { data, error } = await supabase
    .from('servicos')
    .select('*')
    .eq('loja_id', lojaId)
  if (error) throw error
  return ((data || []) as Servico[]).sort((a, b) => a.nome.localeCompare(b.nome))
}

export async function salvarServico(lojaId: string, s: ServicoInput): Promise<Servico[]> {
  const payload = { nome: s.nome, preco: s.preco, duracao: s.duracao }
  const { error } = s.id
    ? await supabase.from('servicos').update(payload).eq('id', s.id).eq('loja_id', lojaId)
    : await supabase.from('servicos').insert({ ...payload, loja_id: lojaId })
  if (error) throw error
  return carregarServicos(lojaId)
}

export async function removerServico(lojaId: string, id: string): Promise<Servico[]> {
  const { error } = await supabase.from('servicos').delete().eq('id', id).eq('loja_id', lojaId)
  if (error) throw error
  return carregarServicos(lojaId)
}
