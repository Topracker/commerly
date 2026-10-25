import { NextRequest, NextResponse } from 'next/server'
import { exigirAdminAuditado } from '../../../lib/admin'

export const runtime = 'nodejs'

// Liga/desliga uma feature flag (global ou por cidade). cidade_slug vazio = global.
// `ativo: null` = cidade volta a HERDAR o global (apaga o override). No global
// não existe "herdar": sem a linha __global__ a flag cai no padrão (ligada) e,
// no caso do delivery, reabre o Brasil inteiro.
export async function POST(request: NextRequest) {
  const ctx = await exigirAdminAuditado(request, 'flag')
  if (!ctx.ok) return new NextResponse(null, { status: 404 })
  const { admin } = ctx

  const body = await request.json().catch(() => ({}))
  const flag = String(body?.flag || '')
  const herdar = body?.ativo === null
  const ativo = !!body?.ativo
  const cidade_slug = String(body?.cidade_slug || '').trim() || '__global__'
  if (!flag) return NextResponse.json({ error: 'flag obrigatória' }, { status: 400 })

  if (herdar) {
    if (cidade_slug === '__global__') {
      return NextResponse.json({ error: 'O escopo global não herda de ninguém.' }, { status: 400 })
    }
    const { error } = await admin.from('feature_flags').delete().eq('cidade_slug', cidade_slug).eq('flag', flag)
    if (error) return NextResponse.json({ error: 'Falha ao salvar.' }, { status: 500 })
    return NextResponse.json({ ok: true, cidade_slug, flag, ativo: null })
  }

  // .select(): a tela só vira a chave com o valor que o banco devolveu.
  const { data, error } = await admin.from('feature_flags')
    .upsert({ cidade_slug, flag, ativo, updated_at: new Date().toISOString() }, { onConflict: 'cidade_slug,flag' })
    .select('ativo').single()
  if (error || !data) return NextResponse.json({ error: 'Falha ao salvar.' }, { status: 500 })
  return NextResponse.json({ ok: true, cidade_slug, flag, ativo: data.ativo })
}
