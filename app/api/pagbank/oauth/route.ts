import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { rateLimit } from '../../../lib/rate-limit'
import { COOKIE_STATE, SCOPES, oauthConfigurado, urlAutorizacao, type Ambiente } from '../../../lib/pagbank'

/**
 * Inicia o Connect do PagBank (OAuth2), igual ao fluxo do Mercado Pago.
 * O `state` vai num cookie httpOnly e é conferido no callback (anti-CSRF).
 */
export async function GET(request: NextRequest) {
  const cookieStore = await cookies()
  const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } },
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', request.url))

  if (!rateLimit(`pb-oauth:${user.id}`, 5, 60_000)) {
    return NextResponse.redirect(new URL('/integracoes?pagbank=erro', request.url))
  }
  if (!oauthConfigurado()) {
    // Sem credenciais de parceiro: a loja ainda pode conectar pelo token manual.
    return NextResponse.redirect(new URL('/integracoes?pagbank=oauth_indisponivel', request.url))
  }

  const { data: loja } = await supabase.from('lojas').select('id').eq('user_id', user.id).single()
  if (!loja) return NextResponse.redirect(new URL('/onboarding', request.url))

  const ambiente: Ambiente = process.env.PAGBANK_AMBIENTE === 'sandbox' ? 'sandbox' : 'producao'
  const redirectUri = `${origin}/api/pagbank/callback`
  const state = crypto.randomUUID()

  const url = new URL(urlAutorizacao(ambiente))
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', process.env.PAGBANK_CLIENT_ID!)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('state', state)
  // O PagBank espera os escopos separados por '+', não por espaço codificado.
  const qs = `${url.searchParams.toString()}&scope=${SCOPES.join('+')}`

  const res = NextResponse.redirect(`${url.origin}${url.pathname}?${qs}`, { status: 303 })
  res.cookies.set(COOKIE_STATE, `${state}:${loja.id}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/pagbank',
    maxAge: 600, // o code do PagBank vale 10 min
  })
  return res
}
