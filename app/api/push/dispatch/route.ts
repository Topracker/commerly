import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '../../../lib/supabase-admin'
import { rateLimit } from '../../../lib/rate-limit'
import { dispatchPushPedido, dispatchPushParceria } from '../../../lib/pushDispatch'

// Dispara o push nativo de um evento que aconteceu no CLIENT (inserção de
// pedido na entrega, avanço de status pelo comerciante, aceite de parceria).
// As rotas 100% server-side chamam o dispatch diretamente; esta rota é a ponte
// para as ações feitas via supabase-js no navegador.
//
// Segurança: o chamador precisa estar logado E ser parte do pedido/parceria —
// senão não poderia disparar push para terceiros. O destinatário e o texto vêm
// das notificações que os triggers já gravaram (nunca do corpo da requisição).
export async function POST(request: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } },
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (!rateLimit(`push-dispatch:${user.id}`, 60, 60_000)) {
    return NextResponse.json({ error: 'Muitas tentativas. Aguarde.' }, { status: 429 })
  }

  const { pedido_id, parceria_id } = await request.json().catch(() => ({}))
  const admin = createAdminClient()

  // ── Evento de pedido (novo ou mudança de status) ──────────────────────────
  if (pedido_id) {
    const { data: pedido } = await admin
      .from('pedidos_clientes')
      .select('id, loja_id, cliente_id, entregador_id')
      .eq('id', pedido_id)
      .single()
    if (!pedido) return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 })

    if (!(await ehParteDoPedido(admin, user.id, pedido))) {
      return NextResponse.json({ error: 'Sem permissão para este pedido.' }, { status: 403 })
    }

    const entregues = await dispatchPushPedido(admin, pedido.id)
    return NextResponse.json({ ok: true, entregues })
  }

  // ── Evento de parceria aceita (comerciante -> entregador) ─────────────────
  if (parceria_id) {
    const { data: parceria } = await admin
      .from('entregador_parcerias')
      .select('id, loja_id')
      .eq('id', parceria_id)
      .single()
    if (!parceria) return NextResponse.json({ error: 'Parceria não encontrada' }, { status: 404 })

    // Só o dono da loja da parceria pode disparar (é ele quem aceita).
    const { data: loja } = await admin.from('lojas').select('user_id').eq('id', parceria.loja_id).single()
    if (!loja || loja.user_id !== user.id) {
      return NextResponse.json({ error: 'Sem permissão para esta parceria.' }, { status: 403 })
    }

    const entregues = await dispatchPushParceria(admin, parceria.id)
    return NextResponse.json({ ok: true, entregues })
  }

  return NextResponse.json({ error: 'pedido_id ou parceria_id obrigatório' }, { status: 400 })
}

// Autoriza se o usuário é o dono da loja, o cliente, ou o entregador do pedido.
async function ehParteDoPedido(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  pedido: { loja_id: string; cliente_id: string | null; entregador_id: string | null },
): Promise<boolean> {
  const [loja, cliente, entregador] = await Promise.all([
    admin.from('lojas').select('user_id').eq('id', pedido.loja_id).maybeSingle(),
    pedido.cliente_id
      ? admin.from('clientes').select('user_id').eq('id', pedido.cliente_id).maybeSingle()
      : Promise.resolve({ data: null }),
    pedido.entregador_id
      ? admin.from('entregadores').select('user_id').eq('id', pedido.entregador_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])
  return (
    loja.data?.user_id === userId ||
    (cliente as any).data?.user_id === userId ||
    (entregador as any).data?.user_id === userId
  )
}
