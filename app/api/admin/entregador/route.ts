import { NextRequest, NextResponse } from 'next/server'
import { exigirAdmin } from '../../../lib/admin'

export const runtime = 'nodejs'

// Aprova/reprova um entregador (admin).
export async function POST(request: NextRequest) {
  const ctx = await exigirAdmin()
  if (!ctx) return NextResponse.json({ error: 'Acesso restrito' }, { status: 403 })
  const { admin } = ctx

  const body = await request.json().catch(() => ({}))
  const id = String(body?.id || '')
  const acao = String(body?.acao || '')
  if (!id || !['aprovar', 'reprovar', 'pendente'].includes(acao)) {
    return NextResponse.json({ error: 'Parâmetros inválidos' }, { status: 400 })
  }
  const status = acao === 'aprovar' ? 'aprovado' : acao === 'reprovar' ? 'reprovado' : 'pendente'
  const { error } = await admin.from('entregadores')
    .update({ aprovacao_status: status, aprovado_em: status === 'aprovado' ? new Date().toISOString() : null })
    .eq('id', id)
  if (error) return NextResponse.json({ error: 'Falha ao atualizar.' }, { status: 500 })
  return NextResponse.json({ ok: true, status })
}
