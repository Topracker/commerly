// Notificações em tempo real (Supabase Realtime).
// A tabela `notificacoes` é compartilhada pelos três papéis; o destinatário é
// sempre um auth.users.id. Os registros nascem de triggers no banco
// (sql/2026-07-03-notificacoes.sql); o app só lê, marca como lida e assina.

export type TipoNotificacao =
  | 'pedido_novo' | 'pedido_status' | 'parceria_aceita' | 'corrida_oferta' | 'cupom' | 'post_novo'
  | 'flash_sale' | 'retencao' | 'relatorio' | 'despacho'
  | 'kit_status' | 'medalha' | 'missao' | 'ranking' | 'cidade' | 'convite'
  | 'promocao' | 'boas_vindas'

export type Notificacao = {
  id: string
  user_id: string
  tipo: TipoNotificacao
  titulo: string
  mensagem: string
  link: string | null
  dados: Record<string, any>
  lida: boolean
  created_at: string
}

// Emoji por tipo, para o ícone da lista/toast.
export const EMOJI_NOTIFICACAO: Record<TipoNotificacao, string> = {
  pedido_novo: '🛎️',
  pedido_status: '📦',
  parceria_aceita: '🤝',
  corrida_oferta: '🛵',
  cupom: '🎁',
  post_novo: '📸',
  flash_sale: '⚡',
  retencao: '👋',
  relatorio: '📊',
  despacho: '📍',
  kit_status: '📦',
  medalha: '🏅',
  missao: '🎯',
  ranking: '🏆',
  cidade: '🏙️',
  convite: '💌',
  promocao: '🏷️',
  boas_vindas: '🎉',
}

// ── Categorias da tela de notificações ──────────────────────────────────────
// A aba filtra por `tipo`. TODO tipo precisa aparecer em exatamente uma
// categoria: um tipo fora daqui só seria visível em "Todos" e passaria batido —
// e hoje `relatorio` sozinho é a maioria das notificações em produção, então
// deixar de fora seria esconder o que mais existe. Por isso há "Sistema", que
// não estava no pedido original mas recolhe retenção/relatório/boas-vindas.
export type CategoriaNotificacao = {
  id: string
  label: string
  tipos: TipoNotificacao[]
}

export const CATEGORIAS_NOTIFICACAO: CategoriaNotificacao[] = [
  { id: 'pedidos',   label: 'Pedidos',   tipos: ['pedido_novo', 'pedido_status', 'despacho', 'corrida_oferta', 'kit_status'] },
  { id: 'medalhas',  label: 'Medalhas',  tipos: ['medalha'] },
  { id: 'missoes',   label: 'Missões',   tipos: ['missao'] },
  { id: 'ranking',   label: 'Ranking',   tipos: ['ranking'] },
  { id: 'cidade',    label: 'Cidade',    tipos: ['cidade'] },
  { id: 'convites',  label: 'Convites',  tipos: ['convite', 'parceria_aceita'] },
  { id: 'promocoes', label: 'Promoções', tipos: ['promocao', 'cupom', 'flash_sale', 'post_novo'] },
  { id: 'sistema',   label: 'Sistema',   tipos: ['relatorio', 'retencao', 'boas_vindas'] },
]

/** Tipos de uma categoria; `null` (aba "Todos") devolve null = sem filtro. */
export function tiposDaCategoria(id: string | null): TipoNotificacao[] | null {
  if (!id) return null
  return CATEGORIAS_NOTIFICACAO.find(c => c.id === id)?.tipos ?? null
}

/** Busca as notificações mais recentes do usuário logado. */
export async function listarNotificacoes(supabase: any, limite = 50): Promise<Notificacao[]> {
  const { data } = await supabase
    .from('notificacoes')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limite)
  return (data || []) as Notificacao[]
}

/** Conta as não lidas (rápido: head + count). */
export async function contarNaoLidas(supabase: any): Promise<number> {
  const { count } = await supabase
    .from('notificacoes')
    .select('id', { count: 'exact', head: true })
    .eq('lida', false)
  return count || 0
}

export async function marcarComoLida(supabase: any, id: string): Promise<void> {
  await supabase.from('notificacoes').update({ lida: true }).eq('id', id)
}

/**
 * Marca como lidas. Sem `tipos`, marca tudo; com `tipos`, só aquela categoria —
 * é o que a aba ativa usa, para não zerar o que o usuário nem viu.
 */
export async function marcarTodasComoLidas(supabase: any, tipos?: TipoNotificacao[] | null): Promise<void> {
  let q = supabase.from('notificacoes').update({ lida: true }).eq('lida', false)
  if (tipos && tipos.length > 0) q = q.in('tipo', tipos)
  await q
}

/**
 * Toca um "ding" curto de notificação sintetizado na hora (Web Audio API) —
 * evita depender de um arquivo de áudio. Silencioso se o navegador bloquear.
 */
export function tocarSomNotificacao(): void {
  try {
    const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const agora = ctx.currentTime
    // Duas notas rápidas (bi-blim), estilo campainha de app.
    for (const [i, freq] of [880, 1320].entries()) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      const t0 = agora + i * 0.12
      gain.gain.setValueAtTime(0, t0)
      gain.gain.linearRampToValueAtTime(0.18, t0 + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.18)
      osc.connect(gain).connect(ctx.destination)
      osc.start(t0)
      osc.stop(t0 + 0.2)
    }
    setTimeout(() => ctx.close().catch(() => {}), 600)
  } catch {
    /* silêncio: som é um extra, nunca deve quebrar a UI */
  }
}

/**
 * Alerta URGENTE de corrida (estilo Uber/iFood): uma sequência de bips mais
 * insistente que o "ding" comum, para o entregador não perder a oferta. Também
 * vibra o aparelho (se suportado). Silencioso se o navegador bloquear o áudio.
 */
export function tocarAlertaCorrida(): void {
  try { navigator.vibrate?.([200, 100, 200, 100, 200]) } catch { /* sem vibração */ }
  try {
    const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const agora = ctx.currentTime
    // Três toques ascendentes e brilhantes, repetidos — "chamada" de corrida.
    const notas = [880, 1175, 1568, 880, 1175, 1568]
    notas.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'triangle'
      osc.frequency.value = freq
      const t0 = agora + i * 0.16
      gain.gain.setValueAtTime(0, t0)
      gain.gain.linearRampToValueAtTime(0.25, t0 + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22)
      osc.connect(gain).connect(ctx.destination)
      osc.start(t0)
      osc.stop(t0 + 0.24)
    })
    setTimeout(() => ctx.close().catch(() => {}), 1400)
  } catch {
    /* silêncio: som é um extra, nunca deve quebrar a UI */
  }
}

/** Tempo relativo curto em pt-BR (ex.: "agora", "5 min", "2 h", "3 d"). */
export function tempoRelativo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} h`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d} d`
  return new Date(iso).toLocaleDateString('pt-BR')
}
