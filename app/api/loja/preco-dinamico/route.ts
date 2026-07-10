// #5 Fator de preço dinâmico da loja, para a vitrine mostrar o preço ajustado.
//
// O cliente precisa VER o preço que vai pagar. O pedido carrega este fator em
// `fator_exibido`, e o guard cobra `least(fator_real, fator_exibido)` — então
// nada aumenta entre a vitrine e o checkout.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '../../../lib/supabase-admin'
import { calcularFator, avisoPrecoDinamico } from '../../../lib/precoDinamico'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const lojaId = new URL(request.url).searchParams.get('loja_id')
  if (!lojaId) return NextResponse.json({ erro: 'loja_id ausente.' }, { status: 400 })

  const admin = createAdminClient()

  const { data: loja } = await admin
    .from('lojas').select('preco_dinamico').eq('id', lojaId).maybeSingle()

  if (!loja) return NextResponse.json({ erro: 'Loja não encontrada.' }, { status: 404 })

  if (!loja.preco_dinamico) {
    return NextResponse.json({ fator: 1, pico: false, altaDemanda: false, aviso: '' })
  }

  // A contagem de pedidos abertos é do servidor: o cliente não enxerga a fila
  // da loja (a RLS de pedidos_clientes esconde pedidos de outros clientes).
  const { count } = await admin
    .from('pedidos_clientes')
    .select('id', { count: 'exact', head: true })
    .eq('loja_id', lojaId)
    .in('status', ['recebido', 'preparando'])

  const f = calcularFator({ ativo: true, pedidosAbertos: count ?? 0 })

  return NextResponse.json({ ...f, aviso: avisoPrecoDinamico(f) })
}
