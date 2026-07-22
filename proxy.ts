import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { situacaoPlano } from './app/lib/plano'

// ============================================================================
// PAYWALL DO LADO DO SERVIDOR (auditoria 2026-07-22)
// ----------------------------------------------------------------------------
// Dois defeitos corrigidos aqui, em direções opostas:
//
// 1. FECHADO DEMAIS. A regra era `loja.plano !== 'ativo'` — `trial_expira_em`
//    nem era lido. Como a cobrança nunca foi ligada de verdade, 17 lojas estão
//    hoje em carência (plano='inativo', teste até 28/07/2026): o `useAuth` as
//    deixa entrar e ESTE arquivo as expulsava para /planos. O paywall do
//    servidor e o do cliente discordavam, e quem estava em dia levava a pior.
//    Agora os dois chamam a MESMA função — `situacaoPlano()` em app/lib/plano.ts.
//
// 2. ABERTO DEMAIS. A lista cobria 14 páginas; o painel tem 24 que chamam
//    `useAuth()`. /pedidos, /clientes, /financeiro, /promocoes, /combos,
//    /agenda, /posts, /notificacoes, /academy e /ads ficavam de fora — com o
//    plano vencido, bastava ir direto nelas. Nenhuma rota de API era coberta.
//
// ESTE ARQUIVO SOZINHO NÃO SEGURA NADA. O painel é client-side e fala DIRETO
// com o Supabase pela chave anon: bloquear a rota HTTP tira o painel do ar, mas
// com a sessão válida na mão um `fetch` no /rest/v1 continua respondendo. O
// bloqueio de verdade mora na RLS — `sql/2026-07-22-paywall-rls.sql`, policies
// `paywall_plano` (RESTRICTIVE) em 32 tabelas, APLICADO em produção.
//
// Os dois se apoiam na MESMA regra (`situacaoPlano` aqui, `plano_bloqueia()` no
// banco): mexeu em uma, mexa na outra ou eles passam a discordar — que foi
// exatamente o defeito nº 1 acima.
// ============================================================================

/** Páginas do painel do comerciante — as 24 que hoje chamam `useAuth()`. */
const PAGINAS_COMERCIANTE = [
  '/dashboard', '/vendas', '/produtos', '/fiado', '/gastos', '/historico',
  '/funcionarios', '/fornecedores', '/mensagens', '/configuracoes', '/feedback',
  '/assistente', '/integracoes', '/servicos', '/pedidos', '/clientes',
  '/financeiro', '/agenda', '/combos', '/promocoes', '/notificacoes', '/posts',
  '/academy', '/ads',
]

// APIs que só fazem sentido para um comerciante em dia. Lista fechada de
// propósito: webhook, cron e callback de OAuth NUNCA podem entrar aqui — a
// Stripe/Mercado Pago/PagBank precisam entregar o evento principalmente quando o
// plano está vencido, senão o pagamento que REGULARIZA a loja nunca é
// processado e ela fica presa fora do painel para sempre.
const APIS_COMERCIANTE = [
  '/api/assistente', '/api/copilot', '/api/commerly-ai', '/api/campanha-retorno',
  '/api/promocoes', '/api/flash-sale', '/api/vision', '/api/nutri',
  '/api/tendencias', '/api/loja', '/api/ads', '/api/entrega/buscar-entregador',
]

const NUNCA_BLOQUEAR = ['webhook', 'cron', 'callback', 'oauth']

function casa(pathname: string, rotas: string[]): boolean {
  return rotas.some(r => pathname === r || pathname.startsWith(r + '/'))
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })
  const { pathname } = request.nextUrl

  if (NUNCA_BLOQUEAR.some(p => pathname.includes(p))) return response

  const ehApi = casa(pathname, APIS_COMERCIANTE)
  const ehPagina = casa(pathname, PAGINAS_COMERCIANTE)
  const ehOnboarding = pathname === '/onboarding' || pathname.startsWith('/onboarding/')

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
    // API responde 401 em JSON; página vai para o login (comportamento antigo).
    if (ehApi) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    if (ehPagina || ehOnboarding) return NextResponse.redirect(new URL('/login', request.url))
    return response
  }

  if (!ehApi && !ehPagina) return response

  const { data: loja, error } = await supabase
    .from('lojas')
    .select('plano, trial_expira_em')
    .eq('user_id', user.id)
    .maybeSingle()

  // FALHA ABERTA de propósito: erro de rede/RLS não pode trancar do lado de fora
  // um comerciante que está pagando. Só bloqueia com resposta clara do banco.
  if (error || !loja) return response
  if (situacaoPlano(loja).liberada) return response

  if (ehApi) {
    return NextResponse.json(
      { error: 'Assinatura vencida. Regularize o plano para continuar.', paywall: true },
      { status: 402 },
    )
  }
  return NextResponse.redirect(new URL('/planos', request.url))
}

export const config = {
  // Estático de propósito: o matcher é analisado em build e não aceita variável.
  matcher: [
    '/dashboard/:path*', '/vendas/:path*', '/produtos/:path*', '/fiado/:path*',
    '/gastos/:path*', '/historico/:path*', '/funcionarios/:path*',
    '/fornecedores/:path*', '/mensagens/:path*', '/configuracoes/:path*',
    '/feedback/:path*', '/assistente/:path*', '/integracoes/:path*',
    '/servicos/:path*', '/onboarding/:path*',
    '/pedidos/:path*', '/clientes/:path*', '/financeiro/:path*', '/agenda/:path*',
    '/combos/:path*', '/promocoes/:path*', '/notificacoes/:path*', '/posts/:path*',
    '/academy/:path*', '/ads/:path*',
    '/api/assistente/:path*', '/api/copilot/:path*', '/api/commerly-ai/:path*',
    '/api/campanha-retorno/:path*', '/api/promocoes/:path*', '/api/flash-sale/:path*',
    '/api/vision/:path*', '/api/nutri/:path*', '/api/tendencias/:path*',
    '/api/loja/:path*', '/api/ads/:path*', '/api/entrega/buscar-entregador',
  ],
}
