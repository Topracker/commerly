import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '../../../lib/supabase-admin'

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ ok: false }, { status: 400 })

  const { type, data } = body
  if (type !== 'payment' || !data?.id) return NextResponse.json({ ok: true })

  const pagRes = await fetch(`https://api.mercadopago.com/v1/payments/${data.id}`, {
    headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` },
  })

  if (!pagRes.ok) return NextResponse.json({ ok: false }, { status: 502 })

  const pagamento = await pagRes.json()
  if (pagamento.status !== 'approved') return NextResponse.json({ ok: true })

  const lojaId = pagamento.external_reference
  if (!lojaId) return NextResponse.json({ ok: false }, { status: 400 })

  const supabase = createAdminClient()

  // Ativa o plano por 35 dias (5 dias de margem sobre os 30 do ciclo)
  const expiraEm = new Date()
  expiraEm.setDate(expiraEm.getDate() + 35)

  const { error } = await supabase
    .from('lojas')
    .update({ plano: 'ativo', trial_expira_em: expiraEm.toISOString() })
    .eq('id', lojaId)

  if (error) {
    console.error('[assinatura-webhook] supabase error:', error)
    return NextResponse.json({ ok: false }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
