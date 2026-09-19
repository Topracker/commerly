// ============================================================================
// IDENTIDADE DO ADMIN — quem pode abrir o painel master
// ----------------------------------------------------------------------------
// Módulo PURO de propósito: só lê env e compara strings. Não importa Supabase
// nem nada pesado, porque é usado nos DOIS lados do guard — no `proxy.ts`
// (antes de a página renderizar) e nas rotas de API (`app/lib/admin.ts`).
//
// O que mudou na auditoria de 2026-09-18, e por quê:
//
// 1. A ÂNCORA É O `user_id`, NÃO O E-MAIL. `user.email` é mutável: o GoTrue
//    deixa o próprio usuário trocar o endereço, e a Admin API troca sem
//    cerimônia. Qualquer caminho futuro que permita a uma conta assumir o
//    e-mail do dono entregaria o painel inteiro. O uuid não muda.
//
// 2. FALHA FECHADA. A versão anterior tinha uma lista PADRÃO no código como
//    fallback de `ADMIN_EMAILS`. Env ausente (ou com o nome errado, tipo
//    ADMIN_EMAIL no singular) caía silenciosamente nessa lista — falhava
//    ABERTA, e ainda deixava dois e-mails hardcoded no repositório. Agora, sem
//    `ADMIN_USER_IDS` configurada, NINGUÉM entra. Painel vazio é acidente
//    barulhento; painel financeiro aberto é acidente silencioso.
//
// 3. E-MAIL, QUANDO CONFIGURADO, RESTRINGE — NÃO LIBERA. `ADMIN_EMAILS` é um
//    filtro ADICIONAL (E lógico), nunca um caminho alternativo de entrada.
//    Sozinha ela não autoriza ninguém.
// ============================================================================

/** Caminho do painel. Sem entropia isso seria `/admin`, que qualquer scanner
 *  tenta; com entropia, varredura cega não acha. Isso é OFUSCAÇÃO — vale como
 *  redução de ruído, nunca como proteção. Quem protege é `ehAdmin()`. */
export const ADMIN_BASE = '/gestao-9qhdsu7ed26t'
export const ADMIN_API_BASE = '/api/gestao-9qhdsu7ed26t'

function listaDaEnv(nome: string): string[] {
  return (process.env[nome] || '')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean)
}

/** uuids autorizados (env `ADMIN_USER_IDS`, separados por vírgula). */
export function adminUserIds(): string[] {
  return listaDaEnv('ADMIN_USER_IDS')
}

/** Filtro opcional de e-mail (env `ADMIN_EMAILS`). Restringe, não libera. */
export function adminEmails(): string[] {
  return listaDaEnv('ADMIN_EMAILS')
}

/** Exige MFA (aal2) mesmo para conta que ainda não cadastrou fator. */
export function exigeMfaSempre(): boolean {
  return process.env.ADMIN_EXIGIR_MFA === '1'
}

/** Há configuração de admin? Sem isso o painel fica fechado para todo mundo. */
export function adminConfigurado(): boolean {
  return adminUserIds().length > 0
}

export type Identidade = { id?: string | null; email?: string | null }

/**
 * A sessão pertence ao dono do painel?
 *
 * Regra: o uuid TEM de casar. Se `ADMIN_EMAILS` estiver configurada, o e-mail
 * também tem de casar (restrição extra, não alternativa).
 */
export function ehAdmin(user: Identidade | null | undefined): boolean {
  if (!user?.id) return false

  const ids = adminUserIds()
  if (ids.length === 0) return false // falha fechada: sem env, ninguém entra
  if (!ids.includes(user.id.toLowerCase())) return false

  const emails = adminEmails()
  if (emails.length > 0) {
    if (!user.email) return false
    if (!emails.includes(user.email.toLowerCase())) return false
  }

  return true
}

/** A rota pertence ao painel master (página ou API)? */
export function ehRotaAdmin(pathname: string): boolean {
  return (
    pathname === ADMIN_BASE ||
    pathname.startsWith(ADMIN_BASE + '/') ||
    pathname === ADMIN_API_BASE ||
    pathname.startsWith(ADMIN_API_BASE + '/')
  )
}
