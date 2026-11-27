// Retry diário dos repasses ao entregador (Vercel Cron, ver vercel.json — o
// plano Hobby não aceita cron sub-diário).
//
//   1. Corridas pagas online, ENTREGUES, com pagamento_corrida='pendente' há
//      mais de HORAS_MIN horas (o confirmar-entrega já tentou e falhou).
//   2. Bônus de indicação de entregador ainda não pagos (o indicado pode ter
//      batido as 5 corridas num dia em que o indicador não tinha Stripe pronto).
//
// O que continuar falhando fica com o erro gravado e aparece em
// Admin → Acertos → "Repasses travados". Idempotente: lib/repasse.ts procura o
// transfer pelo transfer_group antes de criar outro.
//
// Fora de /api/entregador/* de propósito: aquele prefixo obedece à chave de
// módulo `entregador` no proxy, e o dinheiro devido a quem já entregou tem que
// sair mesmo com a rede pausada ("desligar impede começar, nunca terminar").

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '../../../lib/supabase-admin'
import { pagarCorrida, verificarBonusIndicacao } from '../../../lib/repasse'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Só retenta o que o confirmar-entrega já teve chance de pagar. */
const HORAS_MIN = 2
/** Teto por execução, para não estourar o tempo da função. */
const LOTE = 40

export async function GET(req: NextRequest) {
  // Fail-closed: sem CRON_SECRET, ninguém entra.
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 })
  }

  const admin = createAdminClient()
  const corte = new Date(Date.now() - HORAS_MIN * 3600_000).toISOString()

  const { data: pendentes, error } = await admin.from('pedidos_clientes')
    .select('id')
    .eq('status', 'entregue').eq('pagamento_metodo', 'online').eq('pagamento_status', 'pago')
    .eq('pagamento_corrida', 'pendente').not('entregador_id', 'is', null)
    .lt('updated_at', corte)
    .order('updated_at', { ascending: true }).limit(LOTE)
  if (error) {
    console.error('[repasse/cron] leitura falhou:', error.message)
    return NextResponse.json({ erro: 'Falha ao ler pendentes.' }, { status: 500 })
  }

  const corridas = { tentadas: 0, pagas: 0, falhas: [] as { pedido_id: string; erro?: string }[] }
  for (const p of pendentes || []) {
    corridas.tentadas++
    const r = await pagarCorrida(admin, p.id)
    if (r.pago) corridas.pagas++
    else corridas.falhas.push({ pedido_id: p.id, erro: r.erro })
  }

  // Bônus de indicação ainda abertos: resolve o entregador indicado e reavalia.
  const { data: abertas } = await admin.from('indicacoes')
    .select('indicado_user_id').not('bonus_valor', 'is', null).is('bonus_pago_em', null).limit(LOTE)
  const bonus = { avaliados: 0, pagos: 0 }
  for (const ind of abertas || []) {
    const { data: ent } = await admin.from('entregadores').select('id').eq('user_id', ind.indicado_user_id).maybeSingle()
    if (!ent) continue
    bonus.avaliados++
    const r = await verificarBonusIndicacao(admin, ent.id)
    if (r?.pago) bonus.pagos++
  }

  console.log('[repasse/cron]', JSON.stringify({ corridas: { ...corridas, falhas: corridas.falhas.length }, bonus }))
  return NextResponse.json({ ok: true, corridas, bonus })
}
