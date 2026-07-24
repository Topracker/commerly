// Callback do OAuth (Google) via Supabase Auth.
//
// O botão "Entrar com Google" de cada área chama signInWithOAuth com
// redirectTo = /auth/callback?next=<página de login de origem>. O Google
// devolve aqui com um ?code que trocamos por uma sessão (setando os cookies),
// e então voltamos para a página de login de origem — cujo useEffect já sabe
// rotear o usuário para a área/onboarding certos (e barrar papel trocado).
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

// Só aceitamos caminhos internos como destino (evita open redirect).
function destinoSeguro(next: string | null): string {
  if (next && next.startsWith('/') && !next.startsWith('//')) return next
  return '/'
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const type = searchParams.get('type')
  const next = destinoSeguro(searchParams.get('next'))

  // Em produção (Vercel) a origem real vem no x-forwarded-host.
  const forwardedHost = request.headers.get('x-forwarded-host')
  const ehDev = process.env.NODE_ENV === 'development'
  const base = ehDev ? origin : forwardedHost ? `https://${forwardedHost}` : origin

  // RESET DE SENHA (recovery): NÃO consumir o token aqui. Chamar
  // exchangeCodeForSession invalidaria o token/code de recuperação antes de
  // /nova-senha poder usá-lo — a página então mostrava "link expirado". Este
  // callback só existe na allowlist do Supabase (o OAuth usa), então usamos ele
  // como PONTE: repassamos TODOS os parâmetros da URL (token_hash, type, code,
  // erros) intactos para /nova-senha, que aí sim chama verifyOtp/troca a sessão.
  const ehRecovery = type === 'recovery' || next === '/nova-senha'
  if (ehRecovery) {
    const params = new URLSearchParams(searchParams)
    params.delete('next')
    const qs = params.toString()
    return NextResponse.redirect(`${base}/nova-senha${qs ? `?${qs}` : ''}`)
  }

  if (code) {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
          },
        },
      },
    )
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return NextResponse.redirect(`${base}${next}`)
  }

  // Sem code ou falha na troca: volta para a origem sinalizando o erro.
  const sep = next.includes('?') ? '&' : '?'
  return NextResponse.redirect(`${base}${next}${sep}erro=oauth`)
}
