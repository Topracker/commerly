import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

// PagBank Connect (OAuth2).
//   authorize: https://connect.pagbank.com.br/oauth2/authorize
//   token:     POST https://api.pagseguro.com/oauth2/token
//   refresh:   POST https://api.pagseguro.com/oauth2/refresh
// Docs: https://developer.pagbank.com.br/docs/connect-authorization
//
// O fluxo antigo (email + token manual, /api/pagbank/connect) continua valendo.
// Uma conexão OAuth preenche access_token/refresh_token/expires_at; a manual
// preenche `token`. `tokenDaLoja()` resolve os dois.

export type Ambiente = 'sandbox' | 'producao'

// Cookie httpOnly com o `state` do OAuth (anti-CSRF), lido no callback.
export const COOKIE_STATE = 'pb_oauth_state'

// Escopos que a Commerly precisa: ler pedidos/cobranças (sincronização de
// vendas) e ler o cadastro do lojista (identificar a conta conectada).
export const SCOPES = ['payments.read', 'accounts.read'] as const

// Renova o token um pouco antes de vencer — evita corrida com a expiração.
const MARGEM_RENOVACAO_MS = 5 * 60_000

export function urlAutorizacao(ambiente: Ambiente): string {
  return ambiente === 'sandbox'
    ? 'https://connect.sandbox.pagbank.com.br/oauth2/authorize'
    : 'https://connect.pagbank.com.br/oauth2/authorize'
}

export function urlApi(ambiente: Ambiente): string {
  return ambiente === 'sandbox'
    ? 'https://sandbox.api.pagseguro.com'
    : 'https://api.pagseguro.com'
}

export function oauthConfigurado(): boolean {
  return !!(process.env.PAGBANK_CLIENT_ID && process.env.PAGBANK_CLIENT_SECRET)
}

type RespostaToken = {
  access_token: string
  refresh_token?: string
  expires_in?: number
  account_id?: string
}

function headersOAuth(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    X_CLIENT_ID: process.env.PAGBANK_CLIENT_ID!,
    X_CLIENT_SECRET: process.env.PAGBANK_CLIENT_SECRET!,
  }
}

async function postOAuth(ambiente: Ambiente, caminho: string, body: unknown): Promise<RespostaToken> {
  const res = await fetch(`${urlApi(ambiente)}${caminho}`, {
    method: 'POST',
    headers: headersOAuth(),
    body: JSON.stringify(body),
  })
  const texto = await res.text()
  if (!res.ok) {
    throw new Error(`PagBank ${caminho} ${res.status}: ${texto.slice(0, 300)}`)
  }
  return JSON.parse(texto) as RespostaToken
}

/** Troca o `code` do callback por access_token + refresh_token. */
export function trocarCodePorToken(
  ambiente: Ambiente,
  code: string,
  redirectUri: string,
): Promise<RespostaToken> {
  return postOAuth(ambiente, '/oauth2/token', {
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
  })
}

/**
 * Renova o access_token. O PagBank invalida o refresh_token antigo e devolve um
 * novo — por isso sempre gravamos o refresh_token que veio na resposta.
 */
export function renovarToken(ambiente: Ambiente, refreshToken: string): Promise<RespostaToken> {
  return postOAuth(ambiente, '/oauth2/refresh', {
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  })
}

/** Grava/atualiza a conexão OAuth da loja. */
export async function salvarConexao(
  admin: SupabaseClient,
  lojaId: string,
  ambiente: Ambiente,
  t: RespostaToken,
): Promise<void> {
  const expiraEm = t.expires_in
    ? new Date(Date.now() + t.expires_in * 1000).toISOString()
    : null

  const { error } = await admin.from('pagbank_conexoes').upsert({
    loja_id: lojaId,
    ambiente,
    access_token: t.access_token,
    refresh_token: t.refresh_token ?? null,
    expires_at: expiraEm,
    pb_account_id: t.account_id ?? null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'loja_id' })

  if (error) throw new Error(`falha ao salvar conexão PagBank: ${error.message}`)
}

/**
 * Token válido para chamar a API do PagBank em nome da loja.
 *
 * Prioriza a conexão OAuth (renovando se estiver perto de vencer) e cai no
 * token manual quando a loja conectou pelo fluxo antigo. Devolve null se a loja
 * não tem nenhuma conexão utilizável.
 */
export async function tokenDaLoja(
  admin: SupabaseClient,
  lojaId: string,
): Promise<{ token: string; ambiente: Ambiente } | null> {
  const { data: conexao } = await admin
    .from('pagbank_conexoes')
    .select('token, access_token, refresh_token, expires_at, ambiente')
    .eq('loja_id', lojaId)
    .maybeSingle()

  if (!conexao) return null
  const ambiente: Ambiente = conexao.ambiente === 'sandbox' ? 'sandbox' : 'producao'

  if (conexao.access_token) {
    const vencido = conexao.expires_at
      ? new Date(conexao.expires_at).getTime() - MARGEM_RENOVACAO_MS <= Date.now()
      : false

    if (!vencido) return { token: conexao.access_token, ambiente }

    if (conexao.refresh_token && oauthConfigurado()) {
      try {
        const novo = await renovarToken(ambiente, conexao.refresh_token)
        await salvarConexao(admin, lojaId, ambiente, novo)
        return { token: novo.access_token, ambiente }
      } catch (e) {
        console.error('[pagbank] falha ao renovar token:', e)
        // Cai no token manual, se houver.
      }
    }
  }

  if (conexao.token) return { token: conexao.token, ambiente }
  return null
}
