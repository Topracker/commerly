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

// APIs do comerciante que são CADASTRO, não feature: exigem login mas passam
// pelo paywall. Resolver a cidade da loja precisa funcionar no onboarding (o
// plano ainda é 'inativo' quando a loja é criada) e para quem está voltando de
// um plano vencido — senão a loja regulariza e continua sem receber pedido,
// porque `cidade_slug` nulo derruba o gating de `delivery` no escopo global.
const APIS_SEM_PAYWALL = ['/api/loja/cidade']

/**
 * Páginas que exigem apenas LOGIN (qualquer papel), SEM paywall: mostram
 * conteúdo pessoal do usuário — código de embaixador, certificado, materiais de
 * marketing e IA. Eram 100% client-side e renderizavam para visitante anônimo
 * (só falhavam nas chamadas de API). Agora o Proxy manda quem não tem sessão
 * para o login antes de renderizar. Não entram no paywall porque também servem
 * a cliente/entregador (que não têm loja); a checagem de plano é pulada.
 */
const PAGINAS_AUTENTICADAS = [
  '/embaixador', '/certificado', '/marketing', '/commerly-ai',
]

// ----------------------------------------------------------------------------
// ÁREAS POR PAPEL (cliente / entregador / fornecedor) — exigem LOGIN, sem
// paywall (esses papéis são gratuitos). Antes só havia guard client-side
// (useCliente/useEntregador/useFornecedor): a página chegava a montar e só
// depois redirecionava, e um `fetch` direto no /rest/v1 dependia apenas da RLS.
// Agora o Proxy barra o visitante anônimo no servidor, antes de renderizar, e
// manda para a tela de login DAQUELE papel.
//
// Listas EXPLÍCITAS (não prefixo cego) porque cada área tem rotas PÚBLICAS que
// não podem ser bloqueadas: perfis /cliente/[slug] e /fornecedor/[id], a tela
// de login e o convite de festa /cliente/festa/entrar/[codigo] (que guarda o
// código e manda pro login por conta própria).
const PAGINAS_CLIENTE = [
  '/cliente/buscar', '/cliente/clube', '/cliente/dashboard', '/cliente/favoritas',
  '/cliente/feed', '/cliente/festa', '/cliente/loja', '/cliente/mensagens',
  '/cliente/notificacoes', '/cliente/pedidos', '/cliente/ranking', '/cliente/onboarding',
]
const PAGINAS_ENTREGADOR = [
  '/entregador-delivery/dashboard', '/entregador-delivery/notificacoes',
  '/entregador-delivery/onboarding',
]
const PAGINAS_FORNECEDOR = [
  '/fornecedor/avaliacoes', '/fornecedor/configuracoes', '/fornecedor/dashboard',
  '/fornecedor/mensagens', '/fornecedor/produtos', '/fornecedor/onboarding',
]

// Cada área e o login para onde mandar o anônimo.
const AREAS_PAPEL: { paginas: string[]; login: string }[] = [
  { paginas: PAGINAS_CLIENTE, login: '/cliente/login' },
  { paginas: PAGINAS_ENTREGADOR, login: '/entregador-delivery/login' },
  { paginas: PAGINAS_FORNECEDOR, login: '/fornecedor/login' },
]

// Rotas dentro de uma área protegida que, mesmo casando por prefixo, são
// PÚBLICAS (o convite casa com o prefixo '/cliente/festa', então precisa sair).
const EXCECOES_PUBLICAS = ['/cliente/festa/entrar']

const NUNCA_BLOQUEAR = ['webhook', 'cron', 'callback', 'oauth']

function casa(pathname: string, rotas: string[]): boolean {
  return rotas.some(r => pathname === r || pathname.startsWith(r + '/'))
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })
  const { pathname } = request.nextUrl

  if (NUNCA_BLOQUEAR.some(p => pathname.includes(p))) return response

  const ehApi = casa(pathname, APIS_COMERCIANTE)
  const ehApiSemPaywall = casa(pathname, APIS_SEM_PAYWALL)
  const ehPagina = casa(pathname, PAGINAS_COMERCIANTE)
  const ehAutenticada = casa(pathname, PAGINAS_AUTENTICADAS)
  const ehOnboarding = pathname === '/onboarding' || pathname.startsWith('/onboarding/')

  // Área por papel protegida? Descobre o login-alvo (cliente/entregador/
  // fornecedor). Exceções públicas (perfis, convite) ficam de fora.
  let loginPapel: string | null = null
  if (!casa(pathname, EXCECOES_PUBLICAS)) {
    for (const a of AREAS_PAPEL) {
      if (casa(pathname, a.paginas)) { loginPapel = a.login; break }
    }
  }
  const ehAreaPapel = loginPapel !== null

  // Nada a proteger nesta rota (ex.: perfil público, home): segue direto e evita
  // um getUser() de rede à toa.
  if (!ehApi && !ehPagina && !ehAutenticada && !ehOnboarding && !ehAreaPapel) return response

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
    // API responde 401 em JSON; página vai para o login apropriado.
    if (ehApi) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    if (ehAreaPapel) return NextResponse.redirect(new URL(loginPapel!, request.url))
    if (ehPagina || ehOnboarding || ehAutenticada) return NextResponse.redirect(new URL('/login', request.url))
    return response
  }

  // Logado. Áreas de papel, páginas só-login e onboarding não têm paywall:
  // basta a sessão, já validada acima.
  if (ehAreaPapel || ehAutenticada || ehOnboarding || ehApiSemPaywall) return response
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
    // Páginas que exigem só login (qualquer papel), sem paywall:
    '/embaixador/:path*', '/certificado/:path*', '/marketing/:path*', '/commerly-ai/:path*',
    // Áreas por papel — o Proxy roda em todo o prefixo; o código decide o que é
    // protegido (listas explícitas) e o que é público (perfis, login, convite).
    '/cliente/:path*', '/entregador-delivery/:path*', '/fornecedor/:path*',
    '/api/assistente/:path*', '/api/copilot/:path*', '/api/commerly-ai/:path*',
    '/api/campanha-retorno/:path*', '/api/promocoes/:path*', '/api/flash-sale/:path*',
    '/api/vision/:path*', '/api/nutri/:path*', '/api/tendencias/:path*',
    '/api/loja/:path*', '/api/ads/:path*', '/api/entrega/buscar-entregador',
  ],
}
