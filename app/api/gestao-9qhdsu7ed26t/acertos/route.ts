import { NextRequest, NextResponse } from 'next/server'
import { exigirAdminAuditado } from '../../../lib/admin'
import { situacaoAcerto, type AcertoComConfirmacoes } from '../../../lib/acertos'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ============================================================================
// ACERTOS EM DINHEIRO — visão da Commerly (Caminho B, 2026-09-20).
// ----------------------------------------------------------------------------
// GET: o que a Commerly DEVE (de_papel='commerly': cupom da Garantia à loja,
//      bônus do Modo Festa ao entregador) e o que foi CONTESTADO entre
//      entregador e loja — para a equipe mediar.
// POST { acerto_id, referencia_externa?, observacao? }: marca uma dívida da
//      Commerly como liquidada (Pix manual hoje; quando virar Caminho A, a
//      referência passa a ser o id do transfer Stripe e isto some).
// ============================================================================

export async function GET(request: NextRequest) {
  const ctx = await exigirAdminAuditado(request, 'acertos')
  if (!ctx.ok) return new NextResponse(null, { status: 404 })
  const { admin } = ctx

  const { data: linhas, error } = await admin
    .from('acertos_dinheiro')
    .select('*, acertos_confirmacoes(*)')
    .is('estorna_id', null)
    .order('created_at', { ascending: false })
    .limit(500)
  if (error) return NextResponse.json({ error: 'Falha ao ler os acertos.' }, { status: 500 })

  const todos = (linhas || []) as AcertoComConfirmacoes[]
  const comSituacao = todos.map(a => ({ ...a, situacao: situacaoAcerto(a) }))
  const devidos = comSituacao.filter(a => a.de_papel === 'commerly')
  const contestados = comSituacao.filter(a => a.situacao === 'contestado' && a.de_papel !== 'commerly')

  // Nomes para a tela (ids → loja/entregador).
  const lojaIds = [...new Set(comSituacao.map(a => a.loja_id))]
  const entIds = [...new Set(comSituacao.map(a => a.entregador_id).filter(Boolean))] as string[]
  const [{ data: lojas }, { data: ents }] = await Promise.all([
    lojaIds.length ? admin.from('lojas').select('id, nome').in('id', lojaIds) : Promise.resolve({ data: [] as any[] }),
    entIds.length ? admin.from('entregadores').select('id, nome').in('id', entIds) : Promise.resolve({ data: [] as any[] }),
  ])

  const soma = (xs: typeof comSituacao) => Math.round(xs.reduce((s, a) => s + Number(a.valor), 0) * 100) / 100
  return NextResponse.json({
    devidos,
    contestados,
    resumo: {
      commerly_deve_pendente: soma(devidos.filter(a => a.situacao !== 'confirmado')),
      commerly_deve_liquidado: soma(devidos.filter(a => a.situacao === 'confirmado')),
      contestados: contestados.length,
    },
    nomes: {
      lojas: Object.fromEntries((lojas || []).map((l: any) => [l.id, l.nome])),
      entregadores: Object.fromEntries((ents || []).map((e: any) => [e.id, e.nome])),
    },
  })
}

export async function POST(request: NextRequest) {
  const ctx = await exigirAdminAuditado(request, 'acertos')
  if (!ctx.ok) return new NextResponse(null, { status: 404 })
  const { admin, userId } = ctx

  const body = await request.json().catch(() => ({}))
  const acertoId = typeof body?.acerto_id === 'string' ? body.acerto_id : null
  const referencia = typeof body?.referencia_externa === 'string' ? body.referencia_externa.trim().slice(0, 120) || null : null
  const observacao = typeof body?.observacao === 'string' ? body.observacao.trim().slice(0, 300) || null : null
  if (!acertoId) return NextResponse.json({ error: 'acerto_id obrigatório' }, { status: 400 })

  const { data: a } = await admin.from('acertos_dinheiro').select('id, de_papel, estorna_id').eq('id', acertoId).maybeSingle()
  if (!a) return NextResponse.json({ error: 'Acerto não encontrado.' }, { status: 404 })
  if (a.de_papel !== 'commerly' || a.estorna_id) {
    return NextResponse.json({ error: 'Só dívidas da Commerly se liquidam por aqui.' }, { status: 409 })
  }

  // O índice único (acerto_id, papel) where confirmado barra a dupla liquidação.
  const { error } = await admin.from('acertos_confirmacoes').insert({
    acerto_id: acertoId, papel: 'commerly', resultado: 'confirmado',
    user_id: userId, origem: 'admin', observacao, referencia_externa: referencia,
  })
  if (error) {
    if ((error as { code?: string }).code === '23505') {
      return NextResponse.json({ error: 'Este acerto já foi liquidado.' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Falha ao registrar.' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
