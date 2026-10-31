// Tela /pausado: textos por módulo e as páginas que o proxy manda para ela.
// Sem dependência de servidor de propósito — o proxy (edge) e a página leem
// daqui. As chaves vêm da RPC `modulo_ativo()` (feature_flags, escopo global).

export type ModuloPausavel = 'cliente' | 'entregador' | 'fornecedor' | 'modo_festa'

export const TEXTO_PAUSA: Record<ModuloPausavel, { titulo: string; texto: string; voltar: { href: string; label: string } }> = {
  cliente: {
    titulo: 'Pedidos novos estão pausados',
    texto: 'A área de compras está pausada no momento. Seus pedidos em andamento continuam normalmente e você recebe as notificações de sempre.',
    voltar: { href: '/cliente/pedidos', label: 'Ver meus pedidos' },
  },
  modo_festa: {
    titulo: 'O Modo Festa está pausado',
    texto: 'Não dá para criar ou entrar numa festa agora. Festas que já foram fechadas continuam e os pedidos chegam normalmente.',
    voltar: { href: '/cliente/pedidos', label: 'Ver meus pedidos' },
  },
  entregador: {
    titulo: 'A rede de entregadores está pausada',
    texto: 'Novos cadastros e novas corridas estão pausados no momento. Corridas que você já aceitou continuam normalmente até a entrega.',
    voltar: { href: '/entregador-delivery/dashboard', label: 'Ir para o meu painel' },
  },
  fornecedor: {
    titulo: 'As compras de fornecedores estão pausadas',
    texto: 'Não dá para começar um pedido novo a fornecedores agora. Pedidos já feitos continuam normalmente.',
    voltar: { href: '/dashboard', label: 'Voltar ao painel' },
  },
}

/**
 * Páginas que INICIAM algo num módulo e, com a chave desligada, vão para
 * /pausado. Lista explícita (como as do proxy): login, pedidos em andamento,
 * notificações, confirmação de entrega e a festa já criada (/cliente/festa/[id],
 * que ainda pode fechar) NUNCA entram aqui.
 */
export const PAGINAS_QUE_INICIAM: { rota: string; exata?: boolean; modulos: ModuloPausavel[] }[] = [
  { rota: '/cliente/onboarding', modulos: ['cliente'] },
  { rota: '/cliente/buscar', modulos: ['cliente'] },
  { rota: '/cliente/festa', exata: true, modulos: ['cliente', 'modo_festa'] },
  { rota: '/cliente/festa/entrar', modulos: ['cliente', 'modo_festa'] },
  { rota: '/entregador-delivery/onboarding', modulos: ['entregador'] },
  { rota: '/fornecedor/onboarding', modulos: ['fornecedor'] },
  { rota: '/fornecedores', modulos: ['fornecedor'] },
]

export function modulosQueIniciam(pathname: string): ModuloPausavel[] {
  const p = PAGINAS_QUE_INICIAM.find(({ rota, exata }) =>
    pathname === rota || (!exata && pathname.startsWith(rota + '/')))
  return p?.modulos ?? []
}

export function ehModuloPausavel(m: unknown): m is ModuloPausavel {
  return typeof m === 'string' && m in TEXTO_PAUSA
}
