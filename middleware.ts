import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const ROTAS_COMERCIANTE = [
  '/dashboard',
  '/vendas',
  '/produtos',
  '/fiado',
  '/gastos',
  '/historico',
  '/funcionarios',
  '/fornecedores',
  '/mensagens',
  '/configuracoes',
  '/feedback',
  '/assistente',
  '/integracoes',
]

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })
  const { pathname } = request.nextUrl

  // Áreas de cliente e fornecedor temporariamente desativadas
  if (pathname.startsWith('/cliente/') || pathname.startsWith('/fornecedor/')) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Verifica plano para rotas principais do comerciante (exclui onboarding)
  const rotaComerciantePrincipal = ROTAS_COMERCIANTE.some(
    r => pathname === r || pathname.startsWith(r + '/')
  )

  if (rotaComerciantePrincipal) {
    const { data: loja } = await supabase
      .from('lojas')
      .select('plano, trial_expira_em')
      .eq('user_id', user.id)
      .maybeSingle()

    if (loja) {
      const agora = new Date()
      const temAcesso =
        loja.plano === 'ativo' ||
        (loja.plano === 'trial' && loja.trial_expira_em && new Date(loja.trial_expira_em) > agora)

      if (!temAcesso) {
        return NextResponse.redirect(new URL('/planos', request.url))
      }
    }
  }

  return response
}

export const config = {
  matcher: [
    // Comerciante
    '/dashboard/:path*',
    '/vendas/:path*',
    '/produtos/:path*',
    '/fiado/:path*',
    '/gastos/:path*',
    '/historico/:path*',
    '/funcionarios/:path*',
    '/fornecedores/:path*',
    '/mensagens/:path*',
    '/configuracoes/:path*',
    '/feedback/:path*',
    '/assistente/:path*',
    '/integracoes/:path*',
    '/onboarding/:path*',
    // Cliente e Fornecedor — bloqueados temporariamente, redireciona para /
    '/cliente/:path*',
    '/fornecedor/:path*',
  ],
}
