import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '../../../lib/supabase-admin'
import { rateLimit } from '../../../lib/rate-limit'
import { MAX_ENTREGAS_SIMULTANEAS } from '../../../lib/rota'

const ATIVOS = ['recebido', 'preparando', 'saiu']

// Entregador parceiro reivindica um pedido livre. Roda com service role para
// setar entregador_id de forma atômica (só se ainda estiver livre).
export async function POST(request: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } },
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (!rateLimit(`entregador-aceitar:${user.id}`, 30, 60_000)) {
    return NextResponse.json({ error: 'Muitas tentativas. Aguarde.' }, { status: 429 })
  }

  const { pedido_id } = await request.json().catch(() => ({}))
  if (!pedido_id) return NextResponse.json({ error: 'pedido_id obrigatório' }, { status: 400 })

  const admin = createAdminClient()
  const { data: entregador } = await admin.from('entregadores').select('id').eq('user_id', user.id).single()
  if (!entregador) return NextResponse.json({ error: 'Perfil de entregador não encontrado' }, { status: 403 })

  // Teto de entregas simultâneas — o mesmo que /aceitar-junto respeita. Sem isto
  // o entregador acumularia corridas indefinidamente por esta rota.
  const { count: emAndamento } = await admin
    .from('pedidos_clientes').select('id', { count: 'exact', head: true })
    .eq('entregador_id', entregador.id).in('status', ATIVOS)
  if ((emAndamento ?? 0) >= MAX_ENTREGAS_SIMULTANEAS) {
    return NextResponse.json(
      { error: `Você já está com ${MAX_ENTREGAS_SIMULTANEAS} entregas. Conclua uma antes de aceitar outra.` },
      { status: 409 },
    )
  }

  const { data: pedido } = await admin
    .from('pedidos_clientes').select('id, loja_id, entregador_id, status').eq('id', pedido_id).single()
  if (!pedido) return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 })
  if (pedido.entregador_id) return NextResponse.json({ error: 'Pedido já foi aceito por outro entregador.' }, { status: 409 })
  if (pedido.status === 'cancelado' || pedido.status === 'entregue') {
    return NextResponse.json({ error: 'Pedido não está mais disponível.' }, { status: 409 })
  }

  // Precisa de parceria ACEITA com a loja do pedido.
  const { data: parceria } = await admin
    .from('entregador_parcerias').select('id')
    .eq('entregador_id', entregador.id).eq('loja_id', pedido.loja_id).eq('status', 'aceita').maybeSingle()
  if (!parceria) return NextResponse.json({ error: 'Você não é parceiro desta loja.' }, { status: 403 })

  // Atômico: só atribui se ainda estiver livre (is null).
  const { data: upd, error } = await admin
    .from('pedidos_clientes').update({ entregador_id: entregador.id })
    .eq('id', pedido_id).is('entregador_id', null).select('id')
  if (error) return NextResponse.json({ error: 'Erro ao aceitar o pedido.' }, { status: 500 })
  if (!upd || upd.length === 0) return NextResponse.json({ error: 'Pedido já foi aceito.' }, { status: 409 })

  return NextResponse.json({ ok: true })
}
