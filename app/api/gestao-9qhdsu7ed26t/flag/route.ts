import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { exigirAdminAuditado } from '../../../lib/admin'
import { flagSoGlobal } from '../../../lib/featureFlags'
import { slugify } from '../../../lib/crescimento'

// Bairro só existe para `delivery` em Goiânia (CHECK feature_flags_bairro_so_goiania,
// sql/2026-11-26-flag-delivery-por-bairro.sql). Relaxou lá, relaxe aqui.
const CIDADES_COM_BAIRRO = new Set(['goiania'])

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
  const bairro = body?.bairro ? slugify(String(body.bairro)) || null : null
  if (!flag) return NextResponse.json({ error: 'flag obrigatória' }, { status: 400 })
  if (bairro && (flag !== 'delivery' || !CIDADES_COM_BAIRRO.has(cidade_slug))) {
    return NextResponse.json({ error: 'Ajuste por bairro só existe para o delivery em Goiânia.' }, { status: 400 })
  }
  // Chave de módulo (cliente/entregador/fornecedor) só existe no global: uma
  // linha de cidade seria ignorada por getFlags e por modulo_ativo() no SQL.
  if (flagSoGlobal(flag) && cidade_slug !== '__global__') {
    return NextResponse.json({ error: 'Esta chave só existe no escopo global.' }, { status: 400 })
  }

  if (herdar) {
    if (cidade_slug === '__global__') {
      return NextResponse.json({ error: 'O escopo global não herda de ninguém.' }, { status: 400 })
    }
    // Filtra o bairro SEMPRE (null = linha da cidade): sem isto, "cidade herda"
    // apagava junto as linhas de bairro da mesma cidade.
    let del = admin.from('feature_flags').delete().eq('cidade_slug', cidade_slug).eq('flag', flag)
    del = bairro ? del.eq('bairro', bairro) : del.is('bairro', null)
    const { error } = await del
    if (error) return NextResponse.json({ error: 'Falha ao salvar.' }, { status: 500 })
    revalidatePath('/', 'layout')
    return NextResponse.json({ ok: true, cidade_slug, bairro, flag, ativo: null })
  }

  // .select(): a tela só vira a chave com o valor que o banco devolveu.
  const { data, error } = await admin.from('feature_flags')
    .upsert({ cidade_slug, flag, bairro, ativo, updated_at: new Date().toISOString() }, { onConflict: 'cidade_slug,flag,bairro' })
    .select('ativo').single()
  if (error || !data) return NextResponse.json({ error: 'Falha ao salvar.' }, { status: 500 })
  // Páginas públicas em cache voltam a ler a chave na próxima visita, sem esperar
  // o `revalidate` delas: sem isto, o primeiro visitante depois da virada veria a
  // página antiga, por mais tempo que tivesse passado.
  revalidatePath('/', 'layout')
  return NextResponse.json({ ok: true, cidade_slug, bairro, flag, ativo: data.ativo })
}
