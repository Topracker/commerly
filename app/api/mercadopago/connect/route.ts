import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createHmac } from 'crypto'

export async function GET(request: NextRequest) {
  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll() {},
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', request.url))

  const { data: loja } = await supabase
    .from('lojas')
    .select('id')
    .eq('user_id', user.id)
    .single()

  if (!loja) return NextResponse.redirect(new URL('/onboarding', request.url))

  const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin
  const state = criarState(loja.id)

  const params = new URLSearchParams({
    client_id: process.env.MP_CLIENT_ID!,
    response_type: 'code',
    platform_id: 'mp',
    redirect_uri: `${origin}/api/mercadopago/callback`,
    state,
  })

  return NextResponse.redirect(
    `https://auth.mercadopago.com/authorization?${params}`
  )
}

function criarState(lojaId: string): string {
  const timestamp = Date.now()
  const payload = `${lojaId}:${timestamp}`
  const assinatura = createHmac('sha256', process.env.MP_CLIENT_SECRET!)
    .update(payload)
    .digest('hex')
  return Buffer.from(JSON.stringify({ lojaId, timestamp, assinatura })).toString('base64url')
}
