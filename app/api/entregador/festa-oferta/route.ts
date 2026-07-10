import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '../../../lib/supabase-admin'

// Detalhes de uma oferta de FESTA para o entregador a quem ela foi feita.
// As tabelas de festa têm RLS sem policies, então o entregador não lê direto —
// esta rota (service role) devolve o resumo: lojas, endereço e o que ele ganha.
export async function GET(request: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } },
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const ofertaId = new URL(request.url).searchParams.get('oferta_id')
  if (!ofertaId) return NextResponse.json({ error: 'oferta_id obrigatório' }, { status: 400 })

  const admin = createAdminClient()
  const { data: entregador } = await admin.from('entregadores').select('id').eq('user_id', user.id).single()
  if (!entregador) return NextResponse.json({ error: 'Perfil de entregador não encontrado' }, { status: 403 })

  const { data: oferta } = await admin
    .from('corrida_ofertas').select('id, festa_id, entregador_id, valor_total, bonus_pct, distancia_km')
    .eq('id', ofertaId).maybeSingle()
  if (!oferta || !oferta.festa_id) return NextResponse.json({ error: 'Oferta não encontrada' }, { status: 404 })
  if (oferta.entregador_id !== entregador.id) {
    return NextResponse.json({ error: 'Esta oferta não é sua.' }, { status: 403 })
  }

  const { data: festa } = await admin
    .from('festas').select('id, nome, endereco_entrega').eq('id', oferta.festa_id).maybeSingle()
  if (!festa) return NextResponse.json({ error: 'Festa não encontrada' }, { status: 404 })

  // Só as lojas que têm pedido (as pernas reais da viagem).
  const { data: pedidos } = await admin
    .from('pedidos_clientes').select('id, loja_id, valor_corrida').eq('festa_id', festa.id).neq('status', 'cancelado')
  const lojasComPedido = [...new Set((pedidos || []).map((p: any) => p.loja_id as string))]
  const { data: lojas } = await admin.from('lojas').select('id, nome')
    .in('id', lojasComPedido.length ? lojasComPedido : ['00000000-0000-0000-0000-000000000000'])

  return NextResponse.json({
    festa: { id: festa.id, nome: festa.nome, endereco_entrega: festa.endereco_entrega },
    lojas: (lojas || []).map((l: any) => l.nome),
    n_pedidos: (pedidos || []).length,
    valor_total: Number(oferta.valor_total) || 0,
    bonus_pct: oferta.bonus_pct,
    distancia_km: oferta.distancia_km,
  })
}
