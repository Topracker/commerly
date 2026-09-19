import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '../../../lib/supabase-admin'
import { type LinhaExclusao, purgarExclusao } from '../../../lib/exclusaoConta'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// ============================================================================
// Purga diária das contas cuja carência de 30 dias venceu (Vercel Cron, ver
// vercel.json — Hobby só aceita diário, e diário basta aqui).
//
// Pega também o que ficou pela metade numa rodada anterior (banco purgado mas
// Auth ainda vivo): purgarExclusao() é idempotente por etapa.
// ============================================================================
export async function GET(req: NextRequest) {
  // Fail-closed: sem CRON_SECRET ninguém entra (mesmo padrão dos outros crons).
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 })
  }

  const admin = createAdminClient()
  const agora = new Date().toISOString()

  const { data: linhas, error } = await admin
    .from('exclusoes_conta')
    .select('id, user_id, papel, perfil_id, email, executa_apos, executado_em, auth_apagado_em')
    .is('reativado_em', null)
    .is('auth_apagado_em', null)
    .lte('executa_apos', agora)
    .order('executa_apos', { ascending: true })
    .limit(25)
  if (error) {
    console.error('[conta/purgar-cron] listar falhou:', error.message)
    return NextResponse.json({ erro: error.message }, { status: 500 })
  }

  const resultados: { id: string; ok: boolean; etapas: string[]; erro?: string }[] = []
  for (const ex of (linhas || []) as LinhaExclusao[]) {
    const r = await purgarExclusao(admin, ex)
    resultados.push({ id: ex.id, ...r })
    if (!r.ok) console.error('[conta/purgar-cron] falhou:', ex.id, r.erro)
  }

  // Retenção do próprio registro (e-mail 6 meses, hash 2 anos).
  const { data: limpos, error: errLimpa } = await admin.rpc('limpar_exclusoes_antigas')
  if (errLimpa) console.error('[conta/purgar-cron] limpar falhou:', errLimpa.message)

  return NextResponse.json({ ok: true, purgadas: resultados, limpos: limpos ?? 0 })
}
