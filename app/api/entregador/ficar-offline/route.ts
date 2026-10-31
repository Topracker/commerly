import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '../../../lib/supabase-admin'
import { rateLimit } from '../../../lib/rate-limit'
import { ofertarFesta } from '../../../lib/festaDispatch'
import { dissolverLote, redespacharPedido } from '../../../lib/redespacho'

// "Ficar offline" do entregador. Quem solta as corridas é o trigger
// `trg_entregador_offline` (entregador_offline_libera_pedidos): ao passar
// `disponivel` de true para false, os pedidos dele ainda NÃO coletados
// ('recebido'/'preparando') perdem o entregador_id e a oferta aceita expira.
// Em 'saiu' o pedido continua com ele — a máquina D6 (lib/entregaConfirmacao)
// é quem cuida de entrega em rota.
//
// O trigger não reoferta (SQL não chama o despacho). Esta rota faz o mesmo que
// a desistência: anota as corridas antes, grava o offline e reoferta cada
// pedido solto para o próximo do raio, sem quem saiu, avisando a loja.
export async function POST() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } },
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (!rateLimit(`entregador-offline:${user.id}`, 30, 60_000)) {
    return NextResponse.json({ error: 'Muitas tentativas. Aguarde.' }, { status: 429 })
  }

  const admin = createAdminClient()
  const { data: entregador } = await admin.from('entregadores').select('id').eq('user_id', user.id).single()
  if (!entregador) return NextResponse.json({ error: 'Perfil de entregador não encontrado' }, { status: 403 })

  // Corridas que o trigger vai soltar (mesmo filtro dele).
  const { data: antes } = await admin
    .from('pedidos_clientes').select('id, loja_id, lote_entrega_id, festa_id')
    .eq('entregador_id', entregador.id).in('status', ['recebido', 'preparando'])

  // Pela sessão do próprio entregador, como o app sempre fez: mesma RLS, e o
  // trigger dispara igual. `.select()` porque RLS bloqueia sem `error`.
  const { data: gravado, error } = await supabase
    .from('entregadores').update({ disponivel: false }).eq('id', entregador.id).select('id')
  if (error || !gravado || gravado.length === 0) {
    console.error('[ficar-offline] update falhou:', error?.message)
    return NextResponse.json({ error: 'Não foi possível mudar seu status. Tente de novo.' }, { status: 500 })
  }

  // Só o que o trigger de fato soltou (se ele estava offline, nada mudou).
  const ids = (antes || []).map(p => p.id)
  const { data: soltos } = ids.length
    ? await admin.from('pedidos_clientes').select('id').in('id', ids).is('entregador_id', null)
    : { data: [] as { id: string }[] }
  const soltosIds = new Set((soltos || []).map(p => p.id))
  const pedidos = (antes || []).filter(p => soltosIds.has(p.id))

  const resultados: { pedido_id?: string; festa_id?: string; despacho: string }[] = []

  // Pedido avulso: dissolve o lote e reoferta, como na desistência.
  for (const p of pedidos.filter(p => !p.festa_id)) {
    await dissolverLote(admin, p.lote_entrega_id, 'ficar-offline')
    const despacho = await redespacharPedido(
      admin, p.id, p.loja_id, [entregador.id],
      { titulo: 'Entregador ficou offline', motivo: 'entregador_offline' },
      'ficar-offline',
    )
    resultados.push({ pedido_id: p.id, despacho })
  }

  // Festa: uma oferta cobre a festa inteira (lib/festaDispatch) — oferta uma
  // vez por festa, nunca pedido a pedido.
  for (const festaId of [...new Set(pedidos.map(p => p.festa_id).filter((f): f is string => !!f))]) {
    try {
      // A oferta de festa aponta para festa_id (pedido_id nulo): o trigger não
      // a alcança. Expira a aceita dele aqui, como o trigger faz no avulso.
      await admin.from('corrida_ofertas').update({ status: 'expirada' })
        .eq('festa_id', festaId).eq('entregador_id', entregador.id).eq('status', 'aceita')
      const r = await ofertarFesta(admin, festaId)
      resultados.push({ festa_id: festaId, despacho: r.tipo })
    } catch (e) {
      console.error('[ficar-offline] reoferta da festa falhou:', e)
      resultados.push({ festa_id: festaId, despacho: 'erro' })
    }
  }

  return NextResponse.json({ ok: true, reofertados: resultados })
}
