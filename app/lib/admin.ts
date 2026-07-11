import { createAdminClient } from './supabase-admin'
import { supabaseDaRota, usuarioDaRota } from './rotaSupabase'

// Lista de e-mails com acesso ao painel master. Configurável por env
// (ADMIN_EMAILS, separada por vírgula); com um padrão sensato.
const PADRAO = ['matheus@oryon.com.br', 'mtzin.santos.malta10@gmail.com']

export function adminEmails(): string[] {
  const env = (process.env.ADMIN_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
  return (env.length ? env : PADRAO).map(s => s.toLowerCase())
}

export function isAdminEmail(email?: string | null): boolean {
  if (!email) return false
  return adminEmails().includes(email.toLowerCase())
}

/**
 * Garante que a requisição é de um admin. Devolve { admin } (service role) para
 * ler/escrever qualquer dado, ou null se não autorizado.
 */
export async function exigirAdmin(): Promise<{ admin: ReturnType<typeof createAdminClient>; email: string } | null> {
  const supabase = await supabaseDaRota()
  const user = await usuarioDaRota(supabase)
  if (!user || !isAdminEmail(user.email)) return null
  return { admin: createAdminClient(), email: user.email! }
}
