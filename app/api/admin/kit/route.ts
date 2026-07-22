import { NextRequest, NextResponse } from 'next/server'
import { exigirAdmin } from '../../../lib/admin'

export const runtime = 'nodejs'

// Operação do kit: lista os pedidos e avança o status.
//
// Fica sob /admin porque avançar status é ato da operação, não do entregador —
// a RLS de `kit_pedidos` só dá SELECT ao dono justamente por isso. O histórico
// e a notificação push saem do gatilho `trg_kit_status`, não daqui.

const ORDEM = [
  'aguardando_pagamento', 'producao', 'embalado', 'enviado',
  'saiu_entrega', 'recebido', 'ativado',
]

export async function GET() {
  const ctx = await exigirAdmin()
  if (!ctx) return NextResponse.json({ error: 'Acesso restrito' }, { status: 403 })
  const { admin } = ctx

  const { data } = await admin
    .from('kit_pedidos')
    .select('id, entregador_id, status, codigo_rastreio, valor, created_at, updated_at, entregadores(nome)')
    .order('created_at', { ascending: false })
    .limit(100)

  return NextResponse.json({ kits: data || [] })
}

export async function POST(request: NextRequest) {
  const ctx = await exigirAdmin()
  if (!ctx) return NextResponse.json({ error: 'Acesso restrito' }, { status: 403 })
  const { admin } = ctx

  const body = await request.json().catch(() => ({}))
  const id = String(body?.id || '')
  const status = String(body?.status || '')
  const codigo_rastreio = body?.codigo_rastreio ? String(body.codigo_rastreio) : undefined
  if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 })

  if (status && status !== 'cancelado' && !ORDEM.includes(status)) {
    return NextResponse.json({ error: 'status inválido' }, { status: 400 })
  }

  // Só para a frente (ou cancelar). Sem isto, um clique errado devolveria um kit
  // "recebido" para "produção" e o entregador levaria uma notificação absurda.
  if (status && status !== 'cancelado') {
    const { data: atual } = await admin.from('kit_pedidos').select('status').eq('id', id).maybeSingle()
    if (atual && ORDEM.indexOf(status) < ORDEM.indexOf(atual.status)) {
      return NextResponse.json({ error: 'O status do kit só avança.' }, { status: 400 })
    }
  }

  const patch: Record<string, any> = {}
  if (status) patch.status = status
  if (codigo_rastreio !== undefined) patch.codigo_rastreio = codigo_rastreio
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'nada a atualizar' }, { status: 400 })

  const { data, error } = await admin.from('kit_pedidos').update(patch).eq('id', id)
    .select('id, status, codigo_rastreio').single()
  if (error) {
    console.error('[admin/kit] erro:', error.message)
    return NextResponse.json({ error: 'Falha ao atualizar o kit.' }, { status: 500 })
  }
  return NextResponse.json({ ok: true, kit: data })
}
