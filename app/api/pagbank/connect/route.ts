import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '../../../lib/supabase-admin'
import { rateLimit } from '../../../lib/rate-limit'
import { urlConsultaNotificacao } from '../../../lib/pagbankNotificacao'

function getPagBankBaseUrl(ambiente: string): string {
  return ambiente === 'sandbox'
    ? 'https://sandbox.api.pagseguro.com'
    : 'https://api.pagseguro.com'
}

async function tokenValido(ambiente: 'sandbox' | 'producao', token: string): Promise<boolean> {
  const res = await fetch(`${getPagBankBaseUrl(ambiente)}/public-keys`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'card' }),
  }).catch(() => null)
  if (!res) return false
  if (!res.ok) {
    const corpo = await res.text().catch(() => '')
    console.error('[PagBank connect] validação do token falhou', { status: res.status, body: corpo.slice(0, 300), ambiente })
  }
  return res.ok
}

export async function POST(request: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!rateLimit(`pb-connect:${user.id}`, 5, 60_000)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const { data: loja } = await supabase
    .from('lojas')
    .select('id')
    .eq('user_id', user.id)
    .single()
  if (!loja) return NextResponse.json({ error: 'Loja não encontrada' }, { status: 404 })

  const body = await request.json().catch(() => null)
  const email: string = body?.email?.trim() ?? ''
  const token: string = body?.token?.trim() ?? ''
  const ambiente: 'sandbox' | 'producao' = body?.ambiente === 'sandbox' ? 'sandbox' : 'producao'
  if (!email || !token) {
    return NextResponse.json({ error: 'Preencha o e-mail e o token do PagBank.' }, { status: 400 })
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Esse e-mail não parece válido. Use o e-mail com que você entra no PagBank.' }, { status: 400 })
  }

  // Valida o token com POST /public-keys: 201 = token válido, qualquer outra resposta = inválido.
  // A API do PagBank não tem endpoint de listagem de pedidos por data, então não dá pra validar
  // por /orders (ele retorna 400 mesmo com token válido). /public-keys é o jeito confiável.
  if (!(await tokenValido(ambiente, token))) {
    // Antes de dizer "token inválido", vê se ele é do outro ambiente — erro comum
    // é colar o token de testes (sandbox) no lugar do da conta de verdade.
    const outro = ambiente === 'sandbox' ? 'producao' : 'sandbox'
    if (await tokenValido(outro, token)) {
      return NextResponse.json({
        error: outro === 'sandbox'
          ? 'Esse token é de testes (sandbox), não da sua conta de verdade. Gere o token dentro da sua conta PagBank normal e cole de novo.'
          : 'Esse token é da sua conta de verdade, mas foi escolhido o ambiente de testes (sandbox).',
      }, { status: 400 })
    }
    return NextResponse.json({
      error: 'O PagBank não aceitou esse token. Confira se copiou ele inteiro, sem espaços, ou gere um token novo e tente de novo.',
    }, { status: 400 })
  }

  // O aviso de venda da maquininha é consultado com e-mail + token na API v3
  // (ver urlConsultaNotificacao). Um código inexistente responde 404/400 quando
  // o par confere e 401 quando não confere — sem efeito colateral na conta.
  // Falha de rede não bloqueia: o token já foi validado acima.
  try {
    const res = await fetch(
      urlConsultaNotificacao(ambiente, '00000000-0000-0000-0000-000000000000', email, token),
      { headers: { Accept: 'application/xml' } },
    )
    if (res.status === 401) {
      return NextResponse.json({
        error: 'O token é válido, mas o e-mail não é o da conta que gerou esse token. Use o mesmo e-mail com que você entra no PagBank.',
      }, { status: 400 })
    }
  } catch (e) {
    console.error('[PagBank connect] conferência de e-mail falhou (rede); seguindo', e)
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('pagbank_conexoes')
    .upsert({ loja_id: loja.id, email, token, ambiente }, { onConflict: 'loja_id' })

  if (error) {
    console.error('[PagBank connect] upsert error:', error)
    return NextResponse.json({ error: 'Falha ao salvar credenciais' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
