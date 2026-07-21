import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '../../../lib/supabase-admin'
import { rateLimit } from '../../../lib/rate-limit'
import { dispatchPushPedido } from '../../../lib/pushDispatch'
import { ofertarProximoEntregador } from '../../../lib/dispatch'
import { GPS_INATIVIDADE_MS } from '../../../lib/entregadores'
import { rodarWatchdog } from '../../../lib/despachoWatchdog'

// REENTREGA AUTOMATICA: se o entregador saiu para entrega mas ficou 10min sem
// atualizar o GPS (sumiu), libera o pedido, avisa o cliente e oferta a outro
// entregador. Chamado pelo acompanhamento do cliente (poll) e pelo painel da
// loja. Roda com service role; so age quando a inatividade e confirmada no
// servidor (o chamador nao escolhe liberar).
export async function POST(request: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } },
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (!rateLimit(`checar-entregador:${user.id}`, 120, 60_000)) {
    return NextResponse.json({ error: 'Muitas tentativas. Aguarde.' }, { status: 429 })
  }

  const { pedido_id } = await request.json().catch(() => ({}))
  if (!pedido_id) return NextResponse.json({ error: 'pedido_id obrigatório' }, { status: 400 })

  const admin = createAdminClient()
  const { data: pedido } = await admin
    .from('pedidos_clientes')
    .select('id, loja_id, cliente_id, entregador_id, status, updated_at')
    .eq('id', pedido_id).single()
  if (!pedido) return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 })

  // Autorizacao: cliente do pedido ou dono da loja.
  const { data: loja } = await admin
    .from('lojas').select('id, user_id, latitude, longitude').eq('id', pedido.loja_id).single()
  const { data: cliente } = pedido.cliente_id
    ? await admin.from('clientes').select('user_id').eq('id', pedido.cliente_id).maybeSingle()
    : { data: null as any }
  const autorizado = loja?.user_id === user.id || (cliente as any)?.user_id === user.id
  if (!autorizado) return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 })

  // Pedido ainda sem entregador: aproveita esta chamada para dar uma passada do
  // WATCHDOG DE DESPACHO nele. O plano Hobby da Vercel só aceita cron diário,
  // então a cadeia de ofertas precisa de gatilhos vindos do app — e esta rota é
  // justamente a que a tela de acompanhamento do CLIENTE fica chamando. Ou
  // seja: enquanto alguém estiver esperando o pedido, a busca continua andando
  // mesmo com o painel do comerciante fechado.
  if (!pedido.entregador_id) {
    try {
      await rodarWatchdog(admin, undefined, pedido_id)
    } catch (e) {
      console.error('[checar-entregador] watchdog falhou:', e)
    }
    return NextResponse.json({ ok: true, liberado: false })
  }

  // So monitora entregas em rota (o GPS so roda quando status = 'saiu').
  if (pedido.status !== 'saiu') {
    return NextResponse.json({ ok: true, liberado: false })
  }

  // Ultima posicao do entregador; sem GPS ainda, usa o momento em que saiu.
  const { data: loc } = await admin
    .from('entregas_localizacao').select('updated_at').eq('pedido_id', pedido_id).maybeSingle()
  const refMs = new Date(loc?.updated_at || pedido.updated_at).getTime()
  if (Date.now() - refMs <= GPS_INATIVIDADE_MS) {
    return NextResponse.json({ ok: true, liberado: false })
  }

  // --- Reentrega: libera o pedido (mantem status 'saiu' => visual "buscando") ---
  const entregadorAntigo = pedido.entregador_id
  const { error: relErr } = await admin
    .from('pedidos_clientes').update({ entregador_id: null }).eq('id', pedido_id).eq('entregador_id', entregadorAntigo)
  if (relErr) return NextResponse.json({ error: 'Erro ao liberar o pedido.' }, { status: 500 })

  // Encerra a oferta aceita do entregador que sumiu e limpa o GPS obsoleto.
  await admin.from('corrida_ofertas').update({ status: 'expirada' })
    .eq('pedido_id', pedido_id).eq('entregador_id', entregadorAntigo).eq('status', 'aceita')
  await admin.from('entregas_localizacao').delete().eq('pedido_id', pedido_id)

  // Avisa o cliente ("Buscando novo entregador...") + push.
  if (cliente && (cliente as any).user_id) {
    await admin.from('notificacoes').insert({
      user_id: (cliente as any).user_id, tipo: 'pedido_status',
      titulo: 'Buscando novo entregador 🔄',
      mensagem: 'Seu entregador ficou indisponível. Já estamos chamando outro para concluir sua entrega.',
      link: '/cliente/pedidos',
      dados: { pedido_id, status: 'saiu', loja_id: pedido.loja_id },
    })
    await dispatchPushPedido(admin, pedido_id)
  }

  // Oferta a corrida ao proximo entregador disponivel (best-effort).
  let redispatch = 'sem_loja'
  if (loja) {
    try {
      const r = await ofertarProximoEntregador(admin, pedido_id, loja)
      redispatch = r.tipo
    } catch (e) { console.error('[checar-entregador] redispatch falhou:', e) }
  }

  return NextResponse.json({ ok: true, liberado: true, redispatch })
}
