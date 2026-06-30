import { NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import { createAdminClient } from '../../../lib/supabase-admin'

const STATE_TTL_MS = 10 * 60 * 1000 // 10 minutes

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const code = searchParams.get('code')
  const state = searchParams.get('state')

  const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin
  const erroUrl = new URL('/configuracoes?mp=erro', origin)
  const sucessoUrl = new URL('/configuracoes?mp=conectado', origin)

  if (!code || !state) return NextResponse.redirect(erroUrl)

  const lojaId = validarState(state)
  if (!lojaId) return NextResponse.redirect(erroUrl)

  const tokenRes = await fetch('https://api.mercadopago.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.MP_CLIENT_ID,
      client_secret: process.env.MP_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: `${origin}/api/mercadopago/callback`,
    }),
  })

  if (!tokenRes.ok) {
    console.error('[MP callback] token error:', await tokenRes.text())
    return NextResponse.redirect(erroUrl)
  }

  const token = await tokenRes.json()
  const supabase = createAdminClient()

  const { error } = await supabase.from('mercadopago_conexoes').upsert(
    {
      loja_id: lojaId,
      access_token: token.access_token,
      refresh_token: token.refresh_token ?? null,
      mp_user_id: String(token.user_id),
      public_key: token.public_key ?? null,
      expires_at: token.expires_in
        ? new Date(Date.now() + token.expires_in * 1000).toISOString()
        : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'loja_id' }
  )

  if (error) {
    console.error('[MP callback] supabase error:', error)
    return NextResponse.redirect(erroUrl)
  }

  // OBS: o Mercado Pago NÃO expõe endpoint REST para registrar webhook por
  // vendedor (o antigo POST /v1/webhook usado aqui não existe e respondia 404).
  // A configuração é feita UMA vez no painel, no nível da APLICAÇÃO:
  //   Suas integrações > Webhooks > Configurar notificações (modo Produção)
  //   URL: {NEXT_PUBLIC_APP_URL}/api/mercadopago/webhook
  //   Evento: "Pagamentos" (payment)
  // Esse webhook de aplicação recebe as notificações de TODAS as contas
  // conectadas via OAuth — por isso o receiver identifica a loja pelo
  // notification.user_id. O secret gerado no painel deve ser igual ao
  // MP_WEBHOOK_SECRET nas env vars da Vercel.

  if (!process.env.MP_WEBHOOK_SECRET) {
    console.error('[MP callback] ATENÇÃO: MP_WEBHOOK_SECRET não configurada — webhooks serão rejeitados')
  }

  return NextResponse.redirect(sucessoUrl)
}

function validarState(state: string): string | null {
  try {
    const { lojaId, timestamp, assinatura } = JSON.parse(
      Buffer.from(state, 'base64url').toString()
    )
    if (!lojaId || !timestamp || !assinatura) return null
    if (Date.now() - timestamp > STATE_TTL_MS) return null
    const esperada = createHmac('sha256', process.env.MP_CLIENT_SECRET!)
      .update(`${lojaId}:${timestamp}`)
      .digest('hex')
    if (typeof assinatura !== 'string' || assinatura.length !== esperada.length) return null
    return timingSafeEqual(Buffer.from(assinatura), Buffer.from(esperada)) ? lojaId : null
  } catch {
    return null
  }
}
