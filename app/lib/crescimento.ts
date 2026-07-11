// Domínio do ecossistema Commerly: pontos de expansão, níveis por papel,
// medalhas e XP. Fonte única para UI e servidor.

// Pontuação de cada ação na corrida das cidades.
export const PONTOS_ACAO = {
  cliente: 1,
  download: 2,
  entregador: 15,
  comerciante: 30,
  indicacao: 5,
  missao: 10,
  evento: 20,
} as const
export type AcaoPonto = keyof typeof PONTOS_ACAO

export const LEGENDA_PONTOS: { acao: AcaoPonto; rotulo: string; pontos: number }[] = [
  { acao: 'comerciante', rotulo: 'Novo comerciante', pontos: PONTOS_ACAO.comerciante },
  { acao: 'evento', rotulo: 'Participar de evento', pontos: PONTOS_ACAO.evento },
  { acao: 'entregador', rotulo: 'Novo entregador', pontos: PONTOS_ACAO.entregador },
  { acao: 'missao', rotulo: 'Completar missão', pontos: PONTOS_ACAO.missao },
  { acao: 'indicacao', rotulo: 'Indicação', pontos: PONTOS_ACAO.indicacao },
  { acao: 'download', rotulo: 'Baixar o app', pontos: PONTOS_ACAO.download },
  { acao: 'cliente', rotulo: 'Novo cliente', pontos: PONTOS_ACAO.cliente },
]

// ---------------------------------------------------------------------------
// Níveis por papel (baseados em XP/pedidos/entregas — o app decide a métrica).
// ---------------------------------------------------------------------------
export type NivelDef = { nome: string; min: number; cor: string; emoji: string; beneficios: string[] }

export const NIVEIS_ENTREGADOR: NivelDef[] = [
  { nome: 'Bronze', min: 0, cor: '#cd7f32', emoji: '🥉', beneficios: ['Acesso básico à plataforma'] },
  { nome: 'Prata', min: 500, cor: '#c0c0c0', emoji: '🥈', beneficios: ['Desconto na bolsa', 'Badge especial'] },
  { nome: 'Ouro', min: 2000, cor: '#f5c34b', emoji: '🥇', beneficios: ['Jaqueta grátis', 'Prioridade nas corridas', 'Badge dourado'] },
  { nome: 'Diamante', min: 10000, cor: '#7dd3fc', emoji: '💎', beneficios: ['Suporte prioritário', 'Squeeze + chaveiro', 'Badge diamante', 'Página de destaque'] },
]

export const NIVEIS_COMERCIANTE: NivelDef[] = [
  { nome: 'Bronze', min: 0, cor: '#cd7f32', emoji: '🥉', beneficios: ['Recém-cadastrado'] },
  { nome: 'Prata', min: 50, cor: '#c0c0c0', emoji: '🥈', beneficios: ['10% de desconto na mensalidade'] },
  { nome: 'Ouro', min: 200, cor: '#f5c34b', emoji: '🥇', beneficios: ['Destaque na busca', '20% de desconto'] },
  { nome: 'Diamante', min: 1000, cor: '#7dd3fc', emoji: '💎', beneficios: ['Suporte prioritário', 'Badge + página de destaque', '30% de desconto'] },
]

export const NIVEIS_CLIENTE: NivelDef[] = [
  { nome: 'Bronze', min: 0, cor: '#cd7f32', emoji: '🥉', beneficios: ['Recém-cadastrado'] },
  { nome: 'Prata', min: 10, cor: '#c0c0c0', emoji: '🥈', beneficios: ['5% de cashback'] },
  { nome: 'Ouro', min: 50, cor: '#f5c34b', emoji: '🥇', beneficios: ['10% de cashback', 'Frete grátis nos fins de semana'] },
  { nome: 'Diamante', min: 200, cor: '#7dd3fc', emoji: '💎', beneficios: ['15% de cashback', 'Frete sempre grátis', 'Acesso antecipado a promoções'] },
]

export const NIVEIS_POR_PAPEL: Record<string, NivelDef[]> = {
  entregador: NIVEIS_ENTREGADOR,
  comerciante: NIVEIS_COMERCIANTE,
  cliente: NIVEIS_CLIENTE,
}

/** Nível atual e progresso até o próximo, para uma pontuação. */
export function nivelDe(niveis: NivelDef[], valor: number) {
  let atual = niveis[0]
  let proximo: NivelDef | null = null
  for (let i = 0; i < niveis.length; i++) {
    if (valor >= niveis[i].min) { atual = niveis[i]; proximo = niveis[i + 1] ?? null }
  }
  const base = atual.min
  const teto = proximo ? proximo.min : atual.min
  const pct = proximo ? Math.min(100, Math.round(((valor - base) / (teto - base)) * 100)) : 100
  const faltam = proximo ? Math.max(0, proximo.min - valor) : 0
  return { atual, proximo, pct, faltam }
}

// ---------------------------------------------------------------------------
// Níveis de embaixador (indicações)
// ---------------------------------------------------------------------------
export const NIVEIS_EMBAIXADOR: NivelDef[] = [
  { nome: 'Iniciante', min: 0, cor: '#94a3b8', emoji: '🌱', beneficios: ['Código exclusivo rastreável'] },
  { nome: 'Ativo', min: 5, cor: '#34d399', emoji: '⚡', beneficios: ['Cashback por indicação'] },
  { nome: 'Expert', min: 20, cor: '#60a5fa', emoji: '🎖️', beneficios: ['Meses grátis', 'Prioridade no suporte'] },
  { nome: 'Elite', min: 50, cor: '#f5c34b', emoji: '👑', beneficios: ['Desconto no kit', 'Jaqueta Commerly', 'Destaque nacional'] },
]

// ---------------------------------------------------------------------------
// Medalhas / conquistas (catálogo)
// ---------------------------------------------------------------------------
export type Medalha = {
  slug: string; nome: string; emoji: string; descricao: string; como: string; secreta?: boolean
}
export const MEDALHAS: Medalha[] = [
  { slug: 'fundador', nome: 'Fundador', emoji: '🏅', descricao: 'Um dos 50 primeiros comerciantes da Commerly.', como: 'Estar entre os 50 primeiros comerciantes cadastrados.' },
  { slug: 'pioneiro', nome: 'Pioneiro', emoji: '🚀', descricao: 'Entre os primeiros da sua cidade.', como: 'Ser um dos 100 primeiros de uma cidade recém-lançada.' },
  { slug: 'embaixador', nome: 'Embaixador', emoji: '🎖️', descricao: 'Leva a Commerly para novas pessoas.', como: 'Indicar pessoas com o seu código exclusivo.' },
  { slug: 'cidade-campea', nome: 'Cidade Campeã', emoji: '🏆', descricao: 'Ajudou a cidade a bater a meta.', como: 'Somar pontos numa cidade que foi escolhida.' },
  { slug: 'primeira-compra', nome: 'Primeira Compra', emoji: '🛍️', descricao: 'Fez o primeiro pedido.', como: 'Concluir seu primeiro pedido.' },
  { slug: 'primeira-entrega', nome: 'Primeira Entrega', emoji: '📦', descricao: 'Completou a primeira entrega.', como: 'Concluir sua primeira entrega como entregador.' },
  { slug: 'fa-da-commerly', nome: 'Fã da Commerly', emoji: '💛', descricao: '1 ano na plataforma.', como: 'Completar 1 ano de conta ativa.' },
  { slug: 'maratonista', nome: 'Maratonista', emoji: '🏃', descricao: '100 pedidos.', como: 'Atingir 100 pedidos.' },
  { slug: 'velocista', nome: 'Velocista', emoji: '⚡', descricao: 'Entrega em menos de 20 min.', como: 'Concluir uma entrega em menos de 20 minutos.' },
  { slug: 'estrela', nome: 'Estrela', emoji: '⭐', descricao: 'Nota 5.0 por 50 pedidos.', como: 'Manter avaliação 5.0 ao longo de 50 pedidos.' },
  { slug: 'top-vendedor', nome: 'Top Vendedor', emoji: '👑', descricao: 'Mais pedidos do mês.', como: 'Ser o comerciante com mais pedidos no mês.' },
  { slug: 'rei-da-cidade', nome: 'Rei da Cidade', emoji: '👑', descricao: 'Mais bem avaliado da cidade.', como: 'Ter a melhor avaliação da sua cidade.' },
  { slug: 'entregador-do-mes', nome: 'Entregador do Mês', emoji: '🥇', descricao: 'Destaque do mês.', como: 'Ser o entregador destaque do mês.' },
  { slug: 'cliente-vip', nome: 'Cliente VIP', emoji: '💎', descricao: 'Cliente nível Diamante.', como: 'Chegar ao nível Diamante como cliente.' },
  { slug: 'super-embaixador', nome: 'Super Embaixador', emoji: '🎖️', descricao: 'Embaixador nível Elite.', como: 'Chegar ao nível Elite de embaixador.' },
  { slug: 'coruja', nome: '???', emoji: '🦉', descricao: 'Conquista secreta.', como: 'Fazer o primeiro pedido à meia-noite em ponto.', secreta: true },
  { slug: 'centenario', nome: '???', emoji: '🔥', descricao: 'Conquista secreta.', como: '100 dias seguidos usando a Commerly.', secreta: true },
  { slug: 'explorador', nome: '???', emoji: '🧭', descricao: 'Conquista secreta.', como: 'Pedir em 3 lojas diferentes no mesmo dia.', secreta: true },
  { slug: 'pioneiro-cidade', nome: '???', emoji: '🌟', descricao: 'Conquista secreta.', como: 'Ser o primeiro comerciante da sua cidade na Commerly.', secreta: true },
  // Medalhas de eventos sazonais (concedidas por atividade durante o evento).
  { slug: 'natal', nome: 'Natal Commerly', emoji: '🎄', descricao: 'Participou do evento de Natal.', como: 'Ter atividade durante o evento de Natal.' },
  { slug: 'black-friday', nome: 'Black Friday', emoji: '🛒', descricao: 'Participou da Black Friday.', como: 'Ter atividade durante a Black Friday.' },
  { slug: 'pascoa', nome: 'Páscoa', emoji: '🐰', descricao: 'Participou do evento de Páscoa.', como: 'Ter atividade durante a Páscoa.' },
  { slug: 'dia-das-maes', nome: 'Dia das Mães', emoji: '💐', descricao: 'Participou do Dia das Mães.', como: 'Ter atividade durante o Dia das Mães.' },
  { slug: 'dia-do-comerciante', nome: 'Dia do Comerciante', emoji: '🏪', descricao: 'Participou do Dia do Comerciante.', como: 'Ter atividade no Dia do Comerciante (16/07).' },
]
export const medalhaPorSlug = (slug: string) => MEDALHAS.find(m => m.slug === slug)

// ---------------------------------------------------------------------------
// Missões (gamificação)
// ---------------------------------------------------------------------------
export type Missao = { slug: string; titulo: string; xp: number; periodo: 'diaria' | 'semanal' | 'mensal' | 'unica'; papel?: string }
export const MISSOES: Missao[] = [
  { slug: 'completar-perfil', titulo: 'Complete seu perfil', xp: 20, periodo: 'unica' },
  { slug: 'primeiro-pedido', titulo: 'Faça seu primeiro pedido', xp: 30, periodo: 'unica', papel: 'cliente' },
  { slug: 'primeira-entrega', titulo: 'Faça sua primeira entrega', xp: 30, periodo: 'unica', papel: 'entregador' },
  { slug: 'cadastrar-comercio', titulo: 'Cadastre seu comércio', xp: 40, periodo: 'unica', papel: 'comerciante' },
  { slug: 'convidar-3', titulo: 'Convide 3 pessoas', xp: 50, periodo: 'semanal' },
  { slug: 'compartilhar-redes', titulo: 'Compartilhe nas redes', xp: 15, periodo: 'diaria' },
  { slug: '10-pedidos', titulo: 'Faça 10 pedidos', xp: 100, periodo: 'mensal', papel: 'cliente' },
  { slug: '100-entregas', titulo: 'Atinja 100 entregas', xp: 300, periodo: 'unica', papel: 'entregador' },
]

// XP → nível numérico simples (a cada 100 XP sobe um nível).
export const xpPorNivel = 100
export function nivelXp(xp: number) {
  const nivel = Math.floor(xp / xpPorNivel) + 1
  const nesteNivel = xp % xpPorNivel
  return { nivel, pct: Math.round((nesteNivel / xpPorNivel) * 100), faltam: xpPorNivel - nesteNivel }
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------
export function slugify(s: string): string {
  return (s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

/** Gera um código de indicação a partir do nome (tipo PEDRO123). */
export function gerarCodigoIndicacao(nome: string): string {
  const base = (nome || 'user').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase().replace(/[^A-Z]/g, '').slice(0, 6) || 'USER'
  return `${base}${Math.floor(100 + Math.random() * 900)}`
}

// ---------------------------------------------------------------------------
// Eventos sazonais (missões e badge exclusivos por período)
// ---------------------------------------------------------------------------
export type EventoSazonal = {
  slug: string; nome: string; emoji: string; cor: string
  inicio: string; fim: string // 'MM-DD'
  descricao: string; medalha: string; missao: string
}
export const EVENTOS_SAZONAIS: EventoSazonal[] = [
  { slug: 'dia-das-maes', nome: 'Dia das Mães', emoji: '💐', cor: '#f472b6', inicio: '05-01', fim: '05-14', descricao: 'Presenteie e movimente o comércio local.', medalha: 'dia-das-maes', missao: 'Faça um pedido no Dia das Mães' },
  { slug: 'pascoa', nome: 'Páscoa', emoji: '🐰', cor: '#a78bfa', inicio: '03-25', fim: '04-05', descricao: 'Chocolate, comércio e comunidade.', medalha: 'pascoa', missao: 'Participe do evento de Páscoa' },
  { slug: 'dia-do-comerciante', nome: 'Dia do Comerciante', emoji: '🏪', cor: '#f5c34b', inicio: '07-14', fim: '07-18', descricao: 'O dia de quem faz o comércio local acontecer.', medalha: 'dia-do-comerciante', missao: 'Esteja ativo no Dia do Comerciante' },
  { slug: 'black-friday', nome: 'Black Friday', emoji: '🛒', cor: '#111827', inicio: '11-24', fim: '11-30', descricao: 'As melhores ofertas do comércio local.', medalha: 'black-friday', missao: 'Faça um pedido na Black Friday' },
  { slug: 'natal', nome: 'Natal Commerly', emoji: '🎄', cor: '#ef4444', inicio: '12-15', fim: '12-25', descricao: 'Espalhe o espírito do comércio local.', medalha: 'natal', missao: 'Participe do evento de Natal' },
]

/** Evento sazonal ativo na data informada (usa mês-dia; ignora o ano). */
export function eventoSazonalAtivo(d: Date = new Date()): EventoSazonal | null {
  const md = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return EVENTOS_SAZONAIS.find(e => md >= e.inicio && md <= e.fim) ?? null
}

// ---------------------------------------------------------------------------
// Slug de perfil público: "nome-uuid". Robusto e único (carrega o id inteiro).
// ---------------------------------------------------------------------------
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function perfilSlug(nome: string, id: string): string {
  const base = slugify(nome) || 'perfil'
  return `${base}-${id}`
}
/** Extrai o id (uuid) de um slug de perfil, ou null. Aceita o uuid puro também. */
export function idDoSlug(slug: string): string | null {
  const s = (slug || '').trim()
  const m = s.match(UUID_RE)
  return m ? m[0] : (UUID_RE.test(s) ? s : null)
}

// Feature flags conhecidas (rótulos para o admin).
export const FEATURE_FLAGS: { flag: string; rotulo: string }[] = [
  { flag: 'delivery', rotulo: 'Delivery' },
  { flag: 'ia', rotulo: 'IA (Commerly AI)' },
  { flag: 'cashback', rotulo: 'Cashback' },
  { flag: 'gamificacao', rotulo: 'Gamificação' },
  { flag: 'kit', rotulo: 'Kit Oficial' },
  { flag: 'fundadores', rotulo: 'Programa Fundadores' },
  { flag: 'embaixadores', rotulo: 'Programa Embaixadores' },
  { flag: 'modo_festa', rotulo: 'Modo Festa' },
  { flag: 'flash_sale', rotulo: 'Flash Sale' },
]

// Marcos históricos e de conquista (homepage / timeline).
export const MARCOS = [
  { valor: 100, rotulo: '100 pedidos', metrica: 'pedidos' as const },
  { valor: 1000, rotulo: '1.000 pedidos', metrica: 'pedidos' as const },
  { valor: 100, rotulo: '100 comerciantes', metrica: 'comerciantes' as const },
  { valor: 100, rotulo: '100 cidades', metrica: 'cidades' as const },
]
