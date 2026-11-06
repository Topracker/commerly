// Chaves de módulo: REGISTRO CENTRAL de quais páginas e APIs pertencem a cada
// chave, e os textos da tela /pausado. O proxy aplica esta lista antes de qualquer
// outra checagem, então vale para sub-rotas e com ou sem login. Rota nova de um
// módulo entra aqui E no `matcher` do proxy.ts (o Next exige o matcher literal).
//
// Sem dependência de servidor de propósito: proxy, páginas e testes leem daqui.
//
// REGRA CENTRAL: desligar impede COMEÇAR, nunca TERMINAR. O que termina algo em
// andamento fica em `excecoes` (pedido aberto, corrida aceita, festa aberta, estorno,
// webhook, cron). Webhook, cron e callback nem chegam aqui: saem antes, no proxy.

export type ModuloPausavel =
  | 'cliente' | 'entregador' | 'fornecedor' | 'delivery' | 'ia' | 'cashback'
  | 'gamificacao' | 'kit' | 'fundadores' | 'embaixadores' | 'modo_festa' | 'flash_sale'

export const MSG_MODULO_INDISPONIVEL = 'Módulo indisponível'

const INICIO = { href: '/', label: 'Ir para o início' }

export const TEXTO_PAUSA: Record<ModuloPausavel, { titulo: string; texto: string; voltar: { href: string; label: string } }> = {
  cliente: {
    titulo: 'Pedidos novos estão pausados',
    texto: 'A área de compras está pausada no momento. Seus pedidos em andamento continuam normalmente e você recebe as notificações de sempre.',
    voltar: { href: '/cliente/pedidos', label: 'Já tenho pedido: ver meus pedidos' },
  },
  modo_festa: {
    titulo: 'O Modo Festa está pausado',
    texto: 'Não dá para criar ou entrar numa festa agora. Festas que já foram abertas continuam e os pedidos chegam normalmente.',
    voltar: { href: '/cliente/pedidos', label: 'Ver meus pedidos' },
  },
  entregador: {
    titulo: 'A rede de entregadores está pausada',
    texto: 'Novos cadastros e novas corridas estão pausados no momento. Corridas que você já aceitou continuam normalmente até a entrega.',
    voltar: { href: '/entregador-delivery/dashboard', label: 'Já sou entregador: ir para o meu painel' },
  },
  fornecedor: {
    titulo: 'As compras de fornecedores estão pausadas',
    texto: 'Não dá para começar um pedido novo a fornecedores agora. Pedidos já feitos continuam normalmente.',
    voltar: { href: '/fornecedor/dashboard', label: 'Já sou fornecedor: ir para o meu painel' },
  },
  delivery: {
    titulo: 'O delivery está pausado',
    texto: 'Não estamos abrindo novas entregas no momento. Pedidos em andamento continuam normalmente.',
    voltar: INICIO,
  },
  ia: {
    titulo: 'Os recursos de IA estão pausados',
    texto: 'O Assistente e o Commerly AI estão pausados no momento. O resto do painel funciona normalmente.',
    voltar: { href: '/dashboard', label: 'Voltar ao painel' },
  },
  cashback: {
    titulo: 'O Clube Commerly está pausado',
    texto: 'Não dá para acumular nem usar pontos agora. Seus pedidos em andamento continuam normalmente.',
    voltar: { href: '/cliente/pedidos', label: 'Ver meus pedidos' },
  },
  gamificacao: {
    titulo: 'Rankings e medalhas estão pausados',
    texto: 'Esta parte da Commerly está pausada no momento. Volte em breve.',
    voltar: INICIO,
  },
  kit: {
    titulo: 'O Kit Oficial está pausado',
    texto: 'Esta parte da Commerly está pausada no momento. Pedidos de kit já feitos continuam normalmente.',
    voltar: INICIO,
  },
  fundadores: {
    titulo: 'O Programa Fundadores está pausado',
    texto: 'As vagas de fundador não estão abertas no momento. Volte em breve.',
    voltar: INICIO,
  },
  embaixadores: {
    titulo: 'O Programa de Embaixadores está pausado',
    texto: 'Não dá para gerar nem usar convites agora. Volte em breve.',
    voltar: INICIO,
  },
  flash_sale: {
    titulo: 'As promoções relâmpago estão pausadas',
    texto: 'Esta parte da Commerly está pausada no momento. Volte em breve.',
    voltar: INICIO,
  },
}

type Regra = {
  rota: string
  exata?: boolean
  modulos: ModuloPausavel[]
  /** Dentro da rota, o que continua aberto para terminar o que já começou. */
  excecoes?: string[]
  /** Exceções que dependem de parâmetro de rota (ex.: a festa já criada). */
  excecoesRe?: RegExp[]
}

export const PAGINAS_MODULO: Regra[] = [
  // Pedidos, notificações, conversa e a festa já criada seguem abertos. O login é
  // tratado à parte: ver LOGINS_MODULO.
  {
    rota: '/cliente', modulos: ['cliente'],
    excecoes: ['/cliente/pedidos', '/cliente/notificacoes', '/cliente/mensagens', '/cliente/login'],
    excecoesRe: [/^\/cliente\/festa\/(?!entrar(\/|$))[^/]+$/],
  },
  { rota: '/para-clientes', modulos: ['cliente'] },
  { rota: '/cliente/festa', exata: true, modulos: ['modo_festa', 'delivery'] },
  { rota: '/cliente/festa/entrar', modulos: ['modo_festa', 'delivery'] },
  { rota: '/cliente/clube', modulos: ['cashback'] },
  { rota: '/cliente/ranking', modulos: ['gamificacao'] },

  {
    rota: '/entregador-delivery', modulos: ['entregador'],
    excecoes: ['/entregador-delivery/dashboard', '/entregador-delivery/notificacoes', '/entregador-delivery/login'],
  },
  { rota: '/entregador', modulos: ['entregador'] },
  { rota: '/para-entregadores', modulos: ['entregador'] },

  {
    rota: '/fornecedor', modulos: ['fornecedor'],
    excecoes: ['/fornecedor/dashboard', '/fornecedor/mensagens', '/fornecedor/produtos', '/fornecedor/avaliacoes', '/fornecedor/configuracoes', '/fornecedor/login'],
  },
  { rota: '/fornecedores', modulos: ['fornecedor'] },

  { rota: '/expansao', modulos: ['delivery'] },
  { rota: '/commerly-ai', modulos: ['ia'] },
  { rota: '/assistente', modulos: ['ia'] },
  { rota: '/medalhas', modulos: ['gamificacao'] },
  { rota: '/ranking', modulos: ['gamificacao'] },
  { rota: '/hall-da-fama', modulos: ['gamificacao'] },
  { rota: '/certificado', modulos: ['gamificacao'] },
  { rota: '/certificado/fundador', modulos: ['fundadores'] },
  { rota: '/certificado/embaixador', modulos: ['embaixadores'] },
  { rota: '/kit', modulos: ['kit'] },
  // `exata`: /loja/[id] é a vitrine pública da loja, não a loja oficial do kit.
  { rota: '/loja', exata: true, modulos: ['kit'] },
  { rota: '/fundadores', modulos: ['fundadores'] },
  { rota: '/embaixadores', modulos: ['embaixadores'] },
  { rota: '/embaixador', modulos: ['embaixadores'] },
  { rota: '/convite', modulos: ['embaixadores'] },
]

export const APIS_MODULO: Regra[] = [
  // Cancelar pedido e privacidade (LGPD) são obrigação: nunca param.
  { rota: '/api/cliente', modulos: ['cliente'], excecoes: ['/api/cliente/cancelar-pedido', '/api/cliente/privacidade'] },
  {
    rota: '/api/entregador', modulos: ['entregador'],
    // Terminar a corrida: confirmar, desistir, ficar offline, ver saldo e a oferta
    // que já estava na tela. lojas-delivery devolve só as lojas das corridas dele.
    excecoes: [
      '/api/entregador/confirmar-entrega', '/api/entregador/confirmar-rota', '/api/entregador/desistir-corrida',
      '/api/entregador/ficar-offline', '/api/entregador/stripe-status', '/api/entregador/lojas-delivery',
      '/api/entregador/festa-oferta',
    ],
  },
  { rota: '/api/entrega/buscar-entregador', modulos: ['entregador', 'delivery'] },
  { rota: '/api/fornecedor', modulos: ['fornecedor'], excecoes: ['/api/fornecedor/stripe-status'] },
  { rota: '/api/b2b', modulos: ['fornecedor'] },
  { rota: '/api/expansao', modulos: ['delivery'] },

  // Festa: criar, entrar, carrinho e cupons param. Estado, minhas, fechar e despachar
  // terminam a festa já aberta, por isso ficam de fora.
  { rota: '/api/festa/criar', modulos: ['cliente', 'modo_festa', 'delivery'] },
  { rota: '/api/festa/entrar', modulos: ['cliente', 'modo_festa', 'delivery'] },
  { rota: '/api/festa/carrinho', modulos: ['cliente', 'modo_festa'] },
  { rota: '/api/festa/cupons', modulos: ['cliente', 'modo_festa'] },

  { rota: '/api/assistente', modulos: ['ia'] },
  { rota: '/api/commerly-ai', modulos: ['ia'] },
  { rota: '/api/copilot', modulos: ['ia'] },
  { rota: '/api/cardapio/digitalizar', modulos: ['ia'] },
  { rota: '/api/cardapio/gerar', modulos: ['ia'] },
  { rota: '/api/vision', modulos: ['ia', 'cliente'] },
  { rota: '/api/nutri', modulos: ['ia'] },
  { rota: '/api/onboarding-ia', modulos: ['ia'] },

  { rota: '/api/gamificacao', modulos: ['gamificacao'] },
  { rota: '/api/ranking', modulos: ['gamificacao'] },
  { rota: '/api/kit', modulos: ['kit'] },
  { rota: '/api/planos/vagas', modulos: ['fundadores'] },
  // O desconto de quem já indicou continua: é preço, não adesão ao programa.
  { rota: '/api/indicacao', modulos: ['embaixadores'], excecoes: ['/api/indicacao/desconto'] },
  { rota: '/api/flash-sale', modulos: ['flash_sale'] },
]

/**
 * Login só abre com `?continuar=1` ou sessão: é o caminho de quem tem pedido ou
 * corrida para terminar. Sem isso, quem digita a rota cai em /pausado, que traz o
 * botão para continuar. As telas escondem "Criar conta" com a chave desligada.
 */
export const LOGINS_MODULO: Record<string, ModuloPausavel> = {
  '/cliente/login': 'cliente',
  '/entregador-delivery/login': 'entregador',
  '/fornecedor/login': 'fornecedor',
}

function casaRegra(pathname: string, r: Regra): boolean {
  if (pathname !== r.rota && (r.exata || !pathname.startsWith(r.rota + '/'))) return false
  if (r.excecoes?.some(e => pathname === e || pathname.startsWith(e + '/'))) return false
  if (r.excecoesRe?.some(re => re.test(pathname))) return false
  return true
}

function modulosDaLista(lista: Regra[], pathname: string): ModuloPausavel[] {
  const achados = new Set<ModuloPausavel>()
  for (const r of lista) if (casaRegra(pathname, r)) r.modulos.forEach(m => achados.add(m))
  return [...achados]
}

export const modulosDaPagina = (pathname: string) => modulosDaLista(PAGINAS_MODULO, pathname)
export const modulosDaApi = (pathname: string) => modulosDaLista(APIS_MODULO, pathname)

export function ehModuloPausavel(m: unknown): m is ModuloPausavel {
  return typeof m === 'string' && Object.prototype.hasOwnProperty.call(TEXTO_PAUSA, m)
}

// ---------------------------------------------------------------------------
// Estado das chaves
// ---------------------------------------------------------------------------

export type LinhaFlag = { flag: string; cidade_slug: string; ativo: boolean }

const GLOBAL = '__global__'
/** Chaves sem override por cidade. Mesma lista de FEATURE_FLAGS `global: true`. */
const SO_GLOBAL = new Set<string>(['cliente', 'entregador', 'fornecedor'])

/**
 * A chave está desligada para quem não tem cidade? Sem linha global = ligada.
 * Com global OFF, qualquer cidade ON mantém o módulo de pé: é o caso do delivery
 * hoje (global OFF + Goiânia ON). A trava fina por cidade fica no checkout e no
 * banco. Chave `delivery` só conta como desligada sem nenhuma cidade ligada.
 */
export function chaveDesligada(linhas: LinhaFlag[], flag: string): boolean {
  const global = linhas.find(l => l.flag === flag && l.cidade_slug === GLOBAL)
  if (!global || global.ativo) return false
  if (SO_GLOBAL.has(flag)) return true
  return !linhas.some(l => l.flag === flag && l.cidade_slug !== GLOBAL && l.ativo)
}

/** Mapa flag -> ligada, sem cidade. Base das telas públicas e do proxy. */
export function mapaPublico(linhas: LinhaFlag[]): Record<ModuloPausavel, boolean> {
  const mapa = {} as Record<ModuloPausavel, boolean>
  for (const m of Object.keys(TEXTO_PAUSA) as ModuloPausavel[]) mapa[m] = !chaveDesligada(linhas, m)
  return mapa
}

/** "comerciantes, clientes e entregadores", só com os papéis ligados. */
export function listaPapeis(flags: Partial<Record<ModuloPausavel, boolean>>): string {
  const papeis = ['comerciantes']
  if (flags.cliente !== false) papeis.push('clientes')
  if (flags.entregador !== false) papeis.push('entregadores')
  if (papeis.length === 1) return papeis[0]
  return `${papeis.slice(0, -1).join(', ')} e ${papeis[papeis.length - 1]}`
}
