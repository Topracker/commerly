import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { enviarPushParaUsuario, pushConfigurado } from './push'

// Disparo de push a partir das notificações RECÉM-criadas pelos triggers do
// banco. Em vez de duplicar a lógica dos triggers (destinatário + textos),
// lemos as linhas que eles acabaram de gravar em `notificacoes` para o mesmo
// pedido/parceria e enviamos o push nativo. Deve ser chamado logo após a
// escrita que dispara o trigger (INSERT/UPDATE de pedidos_clientes ou
// UPDATE de entregador_parcerias), tanto de rotas de API quanto — via
// /api/push/dispatch — de ações do client.

// Janela curta: só pega a notificação do evento atual, não o histórico do pedido.
const JANELA_MS = 45_000

async function enviarNotificacoesRecentes(
  admin: SupabaseClient,
  campo: 'pedido_id' | 'parceria_id',
  valor: string,
): Promise<number> {
  if (!pushConfigurado()) return 0

  const desde = new Date(Date.now() - JANELA_MS).toISOString()
  const { data } = await admin
    .from('notificacoes')
    .select('user_id, titulo, mensagem, link, tipo, created_at')
    .eq(`dados->>${campo}`, valor)
    .gte('created_at', desde)
    .order('created_at', { ascending: false })
    .limit(5)

  const linhas = (data || []) as {
    user_id: string; titulo: string; mensagem: string; link: string | null; tipo: string
  }[]
  if (linhas.length === 0) return 0

  // Uma notificação por destinatário (a mais recente) — evita push duplicado.
  const porUsuario = new Map<string, (typeof linhas)[number]>()
  for (const l of linhas) if (!porUsuario.has(l.user_id)) porUsuario.set(l.user_id, l)

  let total = 0
  await Promise.all(
    [...porUsuario.values()].map(async (l) => {
      total += await enviarPushParaUsuario(admin, l.user_id, {
        titulo: l.titulo, mensagem: l.mensagem, link: l.link, tipo: l.tipo, tag: l.tipo,
      })
    }),
  )
  return total
}

/** Envia push das notificações criadas por um evento de pedido (novo/status). */
export function dispatchPushPedido(admin: SupabaseClient, pedidoId: string): Promise<number> {
  return enviarNotificacoesRecentes(admin, 'pedido_id', pedidoId).catch((e) => {
    console.error('[push] dispatch pedido falhou:', e)
    return 0
  })
}

/** Envia push da notificação criada ao aceitar uma parceria de entregador. */
export function dispatchPushParceria(admin: SupabaseClient, parceriaId: string): Promise<number> {
  return enviarNotificacoesRecentes(admin, 'parceria_id', parceriaId).catch((e) => {
    console.error('[push] dispatch parceria falhou:', e)
    return 0
  })
}
