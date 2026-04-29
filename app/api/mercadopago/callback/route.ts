import { NextRequest, NextResponse } from 'next/server'
import { createHmac } from 'crypto'
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
    return assinatura === esperada ? lojaId : null
  } catch {
    return null
  }
}
