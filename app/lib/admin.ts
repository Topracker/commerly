import { createAdminClient } from './supabase-admin'
import { supabaseDaRota, usuarioDaRota } from './rotaSupabase'
import { ehAdmin, adminConfigurado, exigeMfaSempre } from './adminIdentidade'

// ============================================================================
// GUARD DO PAINEL MASTER (endurecido na auditoria de 2026-09-18)
// ----------------------------------------------------------------------------
// Este arquivo é a ÚNICA coisa entre um usuário logado e todas as linhas de
// todas as tabelas: `exigirAdmin()` devolve um client SERVICE ROLE, que ignora
// RLS por completo. Diferente do resto do app, aqui não existe rede de
// segurança embaixo — a RLS não vai salvar ninguém se a checagem passar batido.
// Por isso as camadas são explícitas e a falha é sempre para o lado fechado.
//
// Camadas, em ordem:
//   1. sessão válida        — `getUser()` valida o JWT no GoTrue (não é
//                             `getSession()`, que apenas confia no cookie)
//   2. identidade           — `ehAdmin()` casa o uuid (e o e-mail, se houver
//                             `ADMIN_EMAILS`) contra a env; ver adminIdentidade.ts
//   3. MFA                  — se a conta TEM fator verificado, o painel exige
//                             que ele tenha sido usado nesta sessão (aal2)
//   4. auditoria            — toda tentativa, aprovada ou não, vira linha em
//                             `admin_acessos` (best-effort, nunca derruba)
//
// A camada 3 é adaptativa de propósito: exigir aal2 de uma conta SEM fator
// cadastrado trancaria o dono do lado de fora do próprio painel, sem tela de
// cadastro de fator para se resgatar. Com `ADMIN_EXIGIR_MFA=1` o modo vira
// rígido — ligue essa env DEPOIS de cadastrar o TOTP.
// ============================================================================

export type MotivoNegado =
  | 'sem-config'      // ADMIN_USER_IDS não configurada — ninguém entra
  | 'sem-sessao'      // visitante anônimo
  | 'nao-autorizado'  // logado, mas não é o dono
  | 'mfa-requerida'   // é o dono, mas não completou o segundo fator

export type ResultadoAdmin =
  | { ok: true; admin: ReturnType<typeof createAdminClient>; userId: string; email: string | null }
  | { ok: false; motivo: MotivoNegado; userId: string | null; email: string | null }

/**
 * Nível de garantia da autenticação (MFA). Devolve null quando não dá para
 * saber — versão do GoTrue sem o endpoint, erro de rede, sessão estranha.
 */
async function nivelMfa(supabase: any): Promise<{ atual: string | null; proximo: string | null }> {
  try {
    const r = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    return { atual: r?.data?.currentLevel ?? null, proximo: r?.data?.nextLevel ?? null }
  } catch {
    return { atual: null, proximo: null }
  }
}

/**
 * Registra a tentativa de acesso. Best-effort: se a tabela ainda não existe
 * (migração não aplicada) ou o insert falha, o acesso segue — auditoria que
 * derruba o painel vira indisponibilidade, não segurança.
 *
 * Tabela: `sql/2026-09-18-admin-auditoria.sql`.
 */
export async function registrarAcessoAdmin(
  admin: ReturnType<typeof createAdminClient>,
  dados: {
    user_id: string | null
    email: string | null
    rota: string
    ip: string | null
    user_agent: string | null
    permitido: boolean
    motivo: MotivoNegado | null
  },
): Promise<void> {
  try {
    const { error } = await admin.from('admin_acessos').insert(dados).select('id')
    if (error) console.warn('[admin/auditoria] não registrou:', error.message)
  } catch (e) {
    console.warn('[admin/auditoria] falhou:', e instanceof Error ? e.message : e)
  }
}

/**
 * Autorização completa, com motivo. Use quando precisar diferenciar "não é
 * você" de "é você, mas falta o segundo fator".
 */
export async function autorizarAdmin(): Promise<ResultadoAdmin> {
  if (!adminConfigurado()) {
    return { ok: false, motivo: 'sem-config', userId: null, email: null }
  }

  const supabase = await supabaseDaRota()
  const user = await usuarioDaRota(supabase)
  if (!user) return { ok: false, motivo: 'sem-sessao', userId: null, email: null }

  const email = user.email ?? null
  if (!ehAdmin({ id: user.id, email })) {
    return { ok: false, motivo: 'nao-autorizado', userId: user.id, email }
  }

  // MFA: `proximo === 'aal2'` significa que a conta TEM fator verificado. Se o
  // nível atual não chegou lá, a sessão não passou pelo segundo fator.
  const { atual, proximo } = await nivelMfa(supabase)
  const temFator = proximo === 'aal2'
  const passouNoFator = atual === 'aal2'
  if ((temFator || exigeMfaSempre()) && !passouNoFator) {
    return { ok: false, motivo: 'mfa-requerida', userId: user.id, email }
  }

  return { ok: true, admin: createAdminClient(), userId: user.id, email }
}

/**
 * Garante que a requisição é do dono do painel. Devolve { admin } (service
 * role) ou null. Mantém a assinatura antiga para não mexer nas 4 rotas que já
 * chamam isto.
 */
export async function exigirAdmin(): Promise<
  { admin: ReturnType<typeof createAdminClient>; email: string; userId: string } | null
> {
  const r = await autorizarAdmin()
  if (!r.ok) return null
  return { admin: r.admin, email: r.email ?? '', userId: r.userId }
}

/**
 * Igual a `exigirAdmin()`, mas registra a tentativa na auditoria. Use nas
 * rotas do painel; o registro sai com service role próprio para conseguir
 * gravar até quando o acesso foi NEGADO (aí não existe `r.admin`).
 */
export async function exigirAdminAuditado(req: Request, rota: string) {
  const r = await autorizarAdmin()
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null
  const user_agent = req.headers.get('user-agent')

  // Sem config não há service role que valha auditar: ninguém entrou, e gravar
  // exigiria justamente a chave que o painel não deveria usar à toa.
  if (!r.ok && r.motivo === 'sem-config') return r

  const cliente = r.ok ? r.admin : createAdminClient()
  await registrarAcessoAdmin(cliente, {
    user_id: r.userId,
    email: r.email,
    rota,
    ip,
    user_agent: user_agent ? user_agent.slice(0, 300) : null,
    permitido: r.ok,
    motivo: r.ok ? null : r.motivo,
  })

  return r
}
