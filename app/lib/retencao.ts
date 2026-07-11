import type { SupabaseClient } from '@supabase/supabase-js'
import { enviarPushParaUsuario, pushConfigurado } from './push'

// Domínio da retenção: dispara um "toque" (notificação in-app + push) com
// dedupe/cooldown por tipo, para não spammar o usuário.

export type Toque = {
  userId: string
  tipo: 'inativo' | 'pendentes' | 'semanal'
  notifTipo: 'retencao' | 'relatorio'
  titulo: string
  mensagem: string
  link: string
}

/** Mapa {user_id:tipo -> última data} dos disparos recentes (para cooldown). */
export async function carregarCooldowns(admin: SupabaseClient, desdeDias = 8): Promise<Map<string, number>> {
  const desde = new Date(Date.now() - desdeDias * 86400000).toISOString()
  const { data } = await admin.from('retencao_log').select('user_id, tipo, enviado_em').gte('enviado_em', desde)
  const m = new Map<string, number>()
  for (const r of data || []) {
    const k = `${r.user_id}:${r.tipo}`
    const t = new Date(r.enviado_em).getTime()
    if (!m.has(k) || t > m.get(k)!) m.set(k, t)
  }
  return m
}

export function emCooldown(cooldowns: Map<string, number>, userId: string, tipo: string, dias: number): boolean {
  const t = cooldowns.get(`${userId}:${tipo}`)
  if (!t) return false
  return Date.now() - t < dias * 86400000
}

/** Notifica in-app + push + registra no log. Retorna se enviou. */
export async function disparar(admin: SupabaseClient, toque: Toque): Promise<boolean> {
  await admin.from('notificacoes').insert({
    user_id: toque.userId, tipo: toque.notifTipo, titulo: toque.titulo, mensagem: toque.mensagem, link: toque.link,
  })
  if (pushConfigurado()) {
    await enviarPushParaUsuario(admin, toque.userId, {
      titulo: toque.titulo, mensagem: toque.mensagem, link: toque.link, tipo: toque.notifTipo, tag: `retencao-${toque.tipo}`,
    })
  }
  await admin.from('retencao_log').insert({ user_id: toque.userId, tipo: toque.tipo })
  return true
}

export const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
