import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '../../../lib/supabase-admin'
import { supabaseDaRota, usuarioDaRota } from '../../../lib/rotaSupabase'
import { normalizarCodigo } from '../../../lib/festas'

export const runtime = 'nodejs'

// Recompensa por indicação por papel do INDICADO:
const RECOMPENSA: Record<string, { creditos?: number; mesGratis?: boolean; label: string }> = {
  comerciante: { mesGratis: true, label: '1 mês grátis' },
  entregador: { creditos: 15, label: 'R$ 15 em créditos' },
  cliente: { creditos: 10, label: 'R$ 10 em créditos' },
  fornecedor: { creditos: 10, label: 'R$ 10 em créditos' },
}

// Confirma a indicação do usuário logado (o INDICADO), atribuindo-a a quem o
// trouxe, e credita a recompensa ao indicador. Idempotente por indicado.
export async function POST(request: NextRequest) {
  const supabase = await supabaseDaRota()
  const user = await usuarioDaRota(supabase)
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const codigo = normalizarCodigo(String(body?.codigo || ''))
  if (codigo.length < 4) return NextResponse.json({ ok: false, ignorado: 'codigo' })

  const admin = createAdminClient()

  // Já foi atribuído antes? (idempotência por indicado)
  const { data: jaFeita } = await admin
    .from('indicacoes').select('id').eq('indicado_user_id', user.id).maybeSingle()
  if (jaFeita) return NextResponse.json({ ok: true, jaRegistrada: true })

  // Dono do código.
  const { data: dono } = await admin
    .from('codigos_indicacao').select('user_id').eq('codigo', codigo).maybeSingle()
  if (!dono || dono.user_id === user.id) return NextResponse.json({ ok: false, ignorado: 'invalido' })

  // Papel do indicado.
  const [{ data: loja }, { data: ent }, { data: forn }] = await Promise.all([
    admin.from('lojas').select('id, nome').eq('user_id', user.id).maybeSingle(),
    admin.from('entregadores').select('id').eq('user_id', user.id).maybeSingle(),
    admin.from('fornecedores').select('id').eq('user_id', user.id).maybeSingle(),
  ])
  const papelIndicado = loja ? 'comerciante' : ent ? 'entregador' : forn ? 'fornecedor' : 'cliente'
  const rec = RECOMPENSA[papelIndicado]

  // Cria a indicação confirmada.
  const { error: insErr } = await admin.from('indicacoes').insert({
    codigo, indicador_user_id: dono.user_id, indicado_user_id: user.id,
    papel_indicado: papelIndicado, status: 'recompensada', recompensa: rec.label,
  })
  if (insErr) {
    // 23505 = corrida: outra requisição já registrou.
    if (insErr.code === '23505') return NextResponse.json({ ok: true, jaRegistrada: true })
    console.error('[indicacao/registrar] erro:', insErr.message)
    return NextResponse.json({ error: 'Falha ao registrar indicação.' }, { status: 500 })
  }

  // Recompensa o indicador.
  if (rec.mesGratis) {
    await admin.from('beneficios_indicacao').insert({
      user_id: dono.user_id, tipo: 'mes_gratis', quantidade: 1, origem_codigo: codigo, indicado_user_id: user.id,
    })
  }
  if (rec.creditos) {
    await admin.from('creditos_mov').insert({
      user_id: dono.user_id, valor: rec.creditos, motivo: `Indicação de ${papelIndicado}`, ref: codigo,
    })
  }
  // Incrementa o contador de usos do código (best-effort).
  const { data: codRow } = await admin.from('codigos_indicacao').select('usos').eq('codigo', codigo).maybeSingle()
  await admin.from('codigos_indicacao').update({ usos: (codRow?.usos || 0) + 1 }).eq('codigo', codigo)

  // Feed da comunidade.
  const quem = loja?.nome || 'Alguém'
  await admin.from('feed_conquistas').insert({ tipo: 'entrou', texto: `🎉 ${quem} entrou na Commerly por indicação` })

  return NextResponse.json({ ok: true, recompensa: rec.label, papel_indicado: papelIndicado })
}
