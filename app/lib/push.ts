import 'server-only'
import webpush from 'web-push'
import type { SupabaseClient } from '@supabase/supabase-js'

// Web Push (VAPID) no servidor. As chaves ficam em env:
//   VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY  — par gerado com web-push
//   VAPID_SUBJECT                         — mailto: ou URL de contato
// A pública também é exposta ao client como NEXT_PUBLIC_VAPID_PUBLIC_KEY para
// o navegador criar a subscription com a mesma applicationServerKey.

let configurado = false

export function pushConfigurado(): boolean {
  return !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY)
}

function garantirVapid() {
  if (configurado) return
  if (!pushConfigurado()) return
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:suporte@commerly.com.br',
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  )
  configurado = true
}

export type PushPayload = {
  titulo: string
  mensagem: string
  link?: string | null
  tipo?: string
  tag?: string
}

type SubRow = { id: string; endpoint: string; p256dh: string; auth: string }

/**
 * Envia um push para TODOS os dispositivos inscritos de um usuário.
 * Usa o service role (admin) para ler as subscriptions ignorando RLS e para
 * apagar as que o push service reportar como mortas (404/410).
 * Retorna quantos foram entregues.
 */
export async function enviarPushParaUsuario(
  admin: SupabaseClient,
  userId: string,
  payload: PushPayload,
): Promise<number> {
  garantirVapid()
  if (!pushConfigurado()) return 0

  const { data } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', userId)

  const subs = (data || []) as SubRow[]
  if (subs.length === 0) return 0

  const corpo = JSON.stringify({
    titulo: payload.titulo,
    mensagem: payload.mensagem,
    link: payload.link || '/',
    tipo: payload.tipo || 'geral',
    tag: payload.tag || payload.tipo || 'commerly',
  })

  const mortas: string[] = []
  let entregues = 0

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          corpo,
          { TTL: 60 * 60 * 24, urgency: 'high' },
        )
        entregues++
      } catch (err: any) {
        const status = err?.statusCode
        // 404/410 = subscription expirada/removida no navegador: limpa do banco.
        if (status === 404 || status === 410) mortas.push(s.id)
        else console.error('[push] falha ao enviar:', status, err?.body || err?.message)
      }
    }),
  )

  if (mortas.length > 0) {
    await admin.from('push_subscriptions').delete().in('id', mortas)
  }

  return entregues
}
