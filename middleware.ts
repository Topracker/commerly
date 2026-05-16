import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

const ROTAS_PROTEGIDAS = [
  '/dashboard',
  '/vendas',
  '/produtos',
  '/gastos',
  '/fiado',
  '/historico',
  '/configuracoes',
  '/assistente',
  '/funcionarios',
  '/integracoes',
  '/mensagens',
  '/fornecedores',
]

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  const protegida = ROTAS_PROTEGIDAS.some(r => pathname === r || pathname.startsWith(r + '/'))
  if (!protegida) return NextResponse.next()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll() {},
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', request.url))

  const { data: loja } = await supabase
    .from('lojas')
    .select('plano, trial_expira_em')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!loja) return NextResponse.redirect(new URL('/onboarding', request.url))

  const agora = new Date()
  const temAcesso =
    loja.plano === 'ativo' ||
    (loja.plano === 'trial' && loja.trial_expira_em && new Date(loja.trial_expira_em) > agora)

  if (!temAcesso) {
    return NextResponse.redirect(new URL('/planos', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/vendas/:path*',
    '/produtos/:path*',
    '/gastos/:path*',
    '/fiado/:path*',
    '/historico/:path*',
    '/configuracoes/:path*',
    '/assistente/:path*',
    '/funcionarios/:path*',
    '/integracoes/:path*',
    '/mensagens/:path*',
    '/fornecedores/:path*',
  ],
}
