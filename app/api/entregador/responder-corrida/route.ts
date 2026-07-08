import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '../../../lib/supabase-admin'
import { rateLimit } from '../../../lib/rate-limit'

// Entregador aceita ou recusa uma oferta de corrida (modelo Uber). Roda com
// service role para atribuir o pedido de forma atomica (so se ainda estiver
// livre) e fechar as ofertas concorrentes do mesmo pedido.
export async function POST(request: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } },
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (!rateLimit(`responder-corrida:${user.id}`, 60, 60_000)) {
    return NextResponse.json({ error: 'Muitas tentativas. Aguarde.' }, { status: 429 })
  }

  const { oferta_id, resposta } = await request.json().catch(() => ({}))
  if (!oferta_id || (resposta !== 'aceita' && resposta !== 'recusada')) {
    return NextResponse.json({ error: 'Informe a oferta e a resposta (aceita/recusada).' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: entregador } = await admin.from('entregadores').select('id').eq('user_id', user.id).single()
  if (!entregador) return NextResponse.json({ error: 'Perfil de entregador não encontrado' }, { status: 403 })

  const { data: oferta } = await admin
    .from('corrida_ofertas').select('*').eq('id', oferta_id).single()
  if (!oferta) return NextResponse.json({ error: 'Oferta não encontrada' }, { status: 404 })
  if (oferta.entregador_id !== entregador.id) {
    return NextResponse.json({ error: 'Esta oferta não é sua.' }, { status: 403 })
  }
  if (oferta.status !== 'pendente') {
    return NextResponse.json({ error: 'Esta oferta não está mais disponível.' }, { status: 409 })
  }

  // ── Recusa ────────────────────────────────────────────────────────────────
  if (resposta === 'recusada') {
    await admin.from('corrida_ofertas').update({ status: 'recusada' }).eq('id', oferta_id)
    return NextResponse.json({ ok: true, recusada: true })
  }

  // ── Aceite ──────────────────────────────────────────────────────────────
  if (new Date(oferta.expira_em).getTime() <= Date.now()) {
    await admin.from('corrida_ofertas').update({ status: 'expirada' }).eq('id', oferta_id).eq('status', 'pendente')
    return NextResponse.json({ error: 'A oferta expirou.' }, { status: 409 })
  }

  const { data: pedido } = await admin
    .from('pedidos_clientes').select('id, entregador_id, status').eq('id', oferta.pedido_id).single()
  if (!pedido) return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 })
  if (pedido.entregador_id) return NextResponse.json({ error: 'Outro entregador já pegou esta corrida.' }, { status: 409 })
  if (pedido.status === 'entregue' || pedido.status === 'cancelado') {
    return NextResponse.json({ error: 'Pedido não está mais disponível.' }, { status: 409 })
  }

  // Atribui de forma atomica: so se ainda estiver livre.
  const { data: upd, error } = await admin
    .from('pedidos_clientes').update({ entregador_id: entregador.id })
    .eq('id', oferta.pedido_id).is('entregador_id', null).select('id')
  if (error) return NextResponse.json({ error: 'Erro ao aceitar a corrida.' }, { status: 500 })
  if (!upd || upd.length === 0) return NextResponse.json({ error: 'Outro entregador já pegou esta corrida.' }, { status: 409 })

  // Fecha esta oferta e expira as demais pendentes do mesmo pedido.
  await admin.from('corrida_ofertas').update({ status: 'aceita' }).eq('id', oferta_id)
  await admin.from('corrida_ofertas').update({ status: 'expirada' })
    .eq('pedido_id', oferta.pedido_id).eq('status', 'pendente')

  return NextResponse.json({ ok: true, pedido_id: oferta.pedido_id })
}
