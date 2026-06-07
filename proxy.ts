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

// Rotas publicas dentro das areas autenticadas — nao exigem sessao.
const PUBLICAS_CLIENTE = ['/cliente/login']
const PUBLICAS_FORNECEDOR = ['/fornecedor/login']

function rotaPublicaFornecedor(pathname: string): boolean {
  if (PUBLICAS_FORNECEDOR.includes(pathname)) return true
  // /fornecedor/[id] — perfil publico do fornecedor (UUID).
  // Cobre /fornecedor/<uuid> mas NAO /fornecedor/dashboard, /fornecedor/produtos, etc.
  const m = pathname.match(/^\/fornecedor\/([^/]+)$/)
  if (!m) return false
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(m[1])
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })
  const { pathname } = request.nextUrl

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

  // /cliente/* — login publico, demais exigem sessao
  if (pathname.startsWith('/cliente/')) {
    if (PUBLICAS_CLIENTE.includes(pathname)) return response
    if (!user) return NextResponse.redirect(new URL('/cliente/login', request.url))
    return response
  }

  // /fornecedor/* — login e perfil publico [id] livres, demais exigem sessao
  if (pathname.startsWith('/fornecedor/')) {
    if (rotaPublicaFornecedor(pathname)) return response
    if (!user) return NextResponse.redirect(new URL('/fornecedor/login', request.url))
    return response
  }

  if (!user) return NextResponse.redirect(new URL('/login', request.url))

  // Verifica plano para rotas principais do comerciante (exclui onboarding)
  const rotaComerciantePrincipal = ROTAS_COMERCIANTE.some(
    r => pathname === r || pathname.startsWith(r + '/')
  )

  if (rotaComerciantePrincipal) {
    const { data: loja } = await supabase
      .from('lojas')
      .select('plano')
      .eq('user_id', user.id)
      .maybeSingle()

    if (loja && loja.plano !== 'ativo') {
      return NextResponse.redirect(new URL('/planos', request.url))
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
    // Cliente — todas as rotas (login tratado internamente)
    '/cliente/:path*',
    // Fornecedor — todas as rotas (login e perfil publico tratados internamente)
    '/fornecedor/:path*',
  ],
}
