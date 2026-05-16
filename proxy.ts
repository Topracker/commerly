import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })

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

  if (user) return response

  const { pathname } = request.nextUrl

  if (pathname.startsWith('/cliente/')) {
    return NextResponse.redirect(new URL('/cliente/login', request.url))
  }

  if (pathname.startsWith('/fornecedor/')) {
    return NextResponse.redirect(new URL('/fornecedor/login', request.url))
  }

  return NextResponse.redirect(new URL('/login', request.url))
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
    // Cliente
    '/cliente/buscar/:path*',
    '/cliente/dashboard/:path*',
    '/cliente/loja/:path*',
    '/cliente/mensagens/:path*',
    '/cliente/onboarding/:path*',
    // Fornecedor
    '/fornecedor/dashboard/:path*',
    '/fornecedor/produtos/:path*',
    '/fornecedor/mensagens/:path*',
    '/fornecedor/configuracoes/:path*',
    '/fornecedor/avaliacoes/:path*',
    '/fornecedor/onboarding/:path*',
  ],
}
