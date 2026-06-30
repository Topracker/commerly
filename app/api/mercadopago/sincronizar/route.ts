import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '../../../lib/supabase-admin'
import { rateLimit } from '../../../lib/rate-limit'
import { sincronizarLojaMP } from '../../../lib/mercadopago-sync'

// Sincronização MANUAL: o lojista logado clica em "Sincronizar pagamentos" e
// buscamos os pagamentos aprovados recentes da conta dele, gravando os que
// faltam. A lógica de busca/gravação fica em lib/mercadopago-sync (também
// usada pelo cron automático).

export async function POST(req: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 })

  if (!rateLimit(`mp-sync:${user.id}`, 10, 60_000)) {
    return NextResponse.json({ erro: 'Muitas sincronizações seguidas. Aguarde um momento.' }, { status: 429 })
  }

  const { data: loja } = await supabase
    .from('lojas')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!loja) return NextResponse.json({ erro: 'Loja não encontrada.' }, { status: 404 })

  const admin = createAdminClient()

  const { data: conexoes, error: cErr } = await admin
    .from('mercadopago_conexoes')
    .select('access_token, updated_at')
    .eq('loja_id', loja.id)
    .order('updated_at', { ascending: false })

  if (cErr) {
    console.error('[MP sync] erro ao buscar conexão:', cErr)
    return NextResponse.json({ erro: 'Erro ao buscar a conexão do Mercado Pago.' }, { status: 500 })
  }
  if (!conexoes || conexoes.length === 0) {
    return NextResponse.json({ erro: 'Mercado Pago não está conectado nesta loja.' }, { status: 400 })
  }

  const r = await sincronizarLojaMP(admin, loja.id, conexoes[0].access_token)

  if (!r.ok) {
    if (r.erro === 'token_expirado') {
      return NextResponse.json(
        { erro: 'O token do Mercado Pago expirou. Reconecte a conta em Integrações.' },
        { status: 401 }
      )
    }
    if (r.erro === 'busca_falhou') {
      return NextResponse.json({ erro: 'Não foi possível consultar o Mercado Pago agora.' }, { status: 502 })
    }
    return NextResponse.json({ erro: 'Erro ao gravar as vendas sincronizadas.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, novas: r.novas, encontrados: r.encontrados })
}
