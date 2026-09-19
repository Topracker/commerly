import { NextResponse } from 'next/server'
import { createAdminClient } from '../../../lib/supabase-admin'
import { supabaseDaRota, usuarioDaRota } from '../../../lib/rotaSupabase'
import { rateLimit } from '../../../lib/rate-limit'
import { DASHBOARD_POR_PAPEL, type PapelExclusao, traduzirErroSql } from '../../../lib/exclusaoConta'

export const runtime = 'nodejs'

// Desfaz o pedido de exclusão dentro da carência. A assinatura NÃO volta
// (foi cancelada na Stripe na hora do pedido): comerciante cai em /planos se
// o trial restaurado já venceu.
export async function POST() {
  const supabase = await supabaseDaRota()
  const user = await usuarioDaRota(supabase)
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (!rateLimit(`conta-reativar:${user.id}`, 5, 600_000)) {
    return NextResponse.json({ error: 'Muitas tentativas' }, { status: 429 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin.rpc('reativar_conta', { p_user_id: user.id })
  if (error) {
    const t = traduzirErroSql(error.message)
    if (t.status === 500) console.error('[conta/reativar] falhou:', error.message)
    return NextResponse.json({ error: t.erro }, { status: t.status })
  }
  const r = data as { id: string; papel: PapelExclusao | null }
  return NextResponse.json({ ok: true, destino: r.papel ? DASHBOARD_POR_PAPEL[r.papel] : '/' })
}
