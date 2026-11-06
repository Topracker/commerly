import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '../../../lib/supabase-admin'
import { oauthConfigurado, tokenDaLoja, urlApi } from '../../../lib/pagbank'

/**
 * Estado da conexão PagBank da loja.
 *
 * `tokenDaLoja` já renova o access_token quando está perto de vencer, então
 * chamar esta rota também serve para manter a conexão viva. Validamos o token
 * com POST /public-keys — a API do PagBank não expõe listagem de pedidos por
 * data, então é o jeito confiável de saber se as credenciais ainda funcionam.
 */
export async function GET() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } },
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 })

  const { data: loja } = await supabase.from('lojas').select('id').eq('user_id', user.id).single()
  if (!loja) return NextResponse.json({ erro: 'Loja não encontrada' }, { status: 404 })

  const admin = createAdminClient()

  const { data: conexao } = await admin
    .from('pagbank_conexoes').select('access_token, token, ambiente, expires_at')
    .eq('loja_id', loja.id).maybeSingle()

  if (!conexao) {
    return NextResponse.json({ conectado: false, oauth_disponivel: oauthConfigurado() })
  }

  const tipo = conexao.access_token ? 'oauth' : 'token_manual'

  let credencial: { token: string; ambiente: 'sandbox' | 'producao' } | null = null
  try {
    credencial = await tokenDaLoja(admin, loja.id)
  } catch (e) {
    console.error('[pagbank/status] erro ao obter token:', e)
  }
  if (!credencial) {
    return NextResponse.json({ conectado: false, tipo, oauth_disponivel: oauthConfigurado() })
  }

  let valido = false
  try {
    const res = await fetch(`${urlApi(credencial.ambiente)}/public-keys`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${credencial.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'card' }),
    })
    valido = res.ok
  } catch (e) {
    console.error('[pagbank/status] falha ao validar token:', e)
  }

  return NextResponse.json({
    conectado: valido,
    tipo,
    ambiente: credencial.ambiente,
    expira_em: conexao.expires_at,
    oauth_disponivel: oauthConfigurado(),
  })
}
