import { NextRequest, NextResponse } from 'next/server'
import { exigirAdminAuditado } from '../../../lib/admin'

export const runtime = 'nodejs'

// Liga/desliga uma feature flag (global ou por cidade). cidade_slug vazio = global.
export async function POST(request: NextRequest) {
  const ctx = await exigirAdminAuditado(request, 'flag')
  if (!ctx.ok) return new NextResponse(null, { status: 404 })
  const { admin } = ctx

  const body = await request.json().catch(() => ({}))
  const flag = String(body?.flag || '')
  const ativo = !!body?.ativo
  const cidade_slug = String(body?.cidade_slug || '').trim() || '__global__'
  if (!flag) return NextResponse.json({ error: 'flag obrigatória' }, { status: 400 })

  const { error } = await admin.from('feature_flags')
    .upsert({ cidade_slug, flag, ativo, updated_at: new Date().toISOString() }, { onConflict: 'cidade_slug,flag' })
  if (error) return NextResponse.json({ error: 'Falha ao salvar.' }, { status: 500 })
  return NextResponse.json({ ok: true, cidade_slug, flag, ativo })
}
