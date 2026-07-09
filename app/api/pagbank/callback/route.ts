import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '../../../lib/supabase-admin'
import { COOKIE_STATE, oauthConfigurado, salvarConexao, trocarCodePorToken, type Ambiente } from '../../../lib/pagbank'

/**
 * Callback do Connect do PagBank: troca o `code` por access_token/refresh_token
 * e grava a conexão da loja.
 */
export async function GET(request: NextRequest) {
  const cookieStore = await cookies()
  const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin
  const { searchParams } = new URL(request.url)

  const erroRedirect = (motivo: string) =>
    NextResponse.redirect(new URL(`/integracoes?pagbank=${motivo}`, request.url))

  if (!oauthConfigurado()) return erroRedirect('oauth_indisponivel')

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } },
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', request.url))

  const code = searchParams.get('code')
  const state = searchParams.get('state')
  if (!code || !state) return erroRedirect('erro')

  // Anti-CSRF: o state tem que bater com o cookie gravado ao iniciar o fluxo.
  const cookieValor = cookieStore.get(COOKIE_STATE)?.value ?? ''
  const [stateSalvo, lojaIdSalva] = cookieValor.split(':')
  if (!stateSalvo || stateSalvo !== state || !lojaIdSalva) return erroRedirect('state_invalido')

  // E a loja do cookie tem que ser mesmo a do usuário logado.
  const { data: loja } = await supabase.from('lojas').select('id').eq('user_id', user.id).single()
  if (!loja || loja.id !== lojaIdSalva) return erroRedirect('erro')

  const ambiente: Ambiente = process.env.PAGBANK_AMBIENTE === 'sandbox' ? 'sandbox' : 'producao'

  try {
    const token = await trocarCodePorToken(ambiente, code, `${origin}/api/pagbank/callback`)
    await salvarConexao(createAdminClient(), loja.id, ambiente, token)
  } catch (e) {
    console.error('[pagbank/callback] falha na troca do code:', e)
    return erroRedirect('erro')
  }

  const res = NextResponse.redirect(new URL('/integracoes?pagbank=ok', request.url))
  res.cookies.delete(COOKIE_STATE)
  return res
}
