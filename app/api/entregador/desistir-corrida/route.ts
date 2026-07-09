import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '../../../lib/supabase-admin'
import { rateLimit } from '../../../lib/rate-limit'

// Entregador desiste de uma corrida ACEITA, devolvendo o pedido ao pool.
// So e permitido ANTES de pegar o pedido: status 'recebido'. A partir de
// 'preparando' (loja ja comprometeu o preparo) ou 'saiu' (pedido em maos), o
// entregador nao pode mais cancelar.
export async function POST(request: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } },
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (!rateLimit(`entregador-desistir:${user.id}`, 30, 60_000)) {
    return NextResponse.json({ error: 'Muitas tentativas. Aguarde.' }, { status: 429 })
  }

  const { pedido_id } = await request.json().catch(() => ({}))
  if (!pedido_id) return NextResponse.json({ error: 'pedido_id obrigatório' }, { status: 400 })

  const admin = createAdminClient()
  const { data: entregador } = await admin.from('entregadores').select('id').eq('user_id', user.id).single()
  if (!entregador) return NextResponse.json({ error: 'Perfil de entregador não encontrado' }, { status: 403 })

  const { data: pedido } = await admin
    .from('pedidos_clientes').select('id, entregador_id, status, lote_entrega_id').eq('id', pedido_id).single()
  if (!pedido) return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 })
  if (pedido.entregador_id !== entregador.id) return NextResponse.json({ error: 'Este pedido não é seu.' }, { status: 403 })
  if (pedido.status !== 'recebido') {
    return NextResponse.json({ error: 'Você não pode mais cancelar: o pedido já está em preparo ou com você.' }, { status: 409 })
  }

  const { error } = await admin
    .from('pedidos_clientes').update({ entregador_id: null }).eq('id', pedido_id).eq('entregador_id', entregador.id)
  if (error) return NextResponse.json({ error: 'Erro ao desistir da corrida.' }, { status: 500 })

  // Multi-entrega: sair do lote dissolve o lote inteiro. A rota otimizada foi
  // calculada para os dois pedidos juntos; com um deles de volta ao pool ela não
  // vale mais. Sem isto o pedido voltaria ao pool carregando `lote_entrega_id` —
  // e tanto ele quanto o irmão seriam recusados por /aceitar-junto para sempre.
  if (pedido.lote_entrega_id) {
    const { error: loteErr } = await admin
      .from('pedidos_clientes')
      .update({ lote_entrega_id: null, ordem_coleta: null, ordem_entrega: null })
      .eq('lote_entrega_id', pedido.lote_entrega_id)
    if (loteErr) console.error('[desistir-corrida] falha ao dissolver o lote:', loteErr)
  }

  // Encerra a oferta aceita deste entregador (nao sera re-ofertado o mesmo).
  await admin.from('corrida_ofertas').update({ status: 'expirada' })
    .eq('pedido_id', pedido_id).eq('entregador_id', entregador.id).eq('status', 'aceita')

  return NextResponse.json({ ok: true })
}
