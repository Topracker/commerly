import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '../../../lib/supabase-admin'
import { webhookValido } from '../../../lib/didit'

// Resultado da verificação de idade. A Didit assina o corpo (HMAC); sem
// assinatura válida nada é gravado. Só "Approved" de sessão de PRODUÇÃO do nosso
// fluxo marca a conta — o fluxo recusa menores de 18 no Brasil.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(request: NextRequest) {
  const segredo = process.env.DIDIT_WEBHOOK_SECRET
  if (!segredo) return NextResponse.json({ error: 'indisponível' }, { status: 503 })

  const corpo = await request.text()
  if (!webhookValido(corpo, request.headers, segredo)) {
    return NextResponse.json({ error: 'assinatura inválida' }, { status: 401 })
  }

  let ev: any
  try { ev = JSON.parse(corpo) } catch { return NextResponse.json({ error: 'corpo inválido' }, { status: 400 }) }

  const ambiente = String(ev.environment || '').toLowerCase()
  const ehTeste = ambiente.includes('sandbox') || ambiente.includes('test')
  const nossoFluxo = !!process.env.DIDIT_WORKFLOW_ID && ev.workflow_id === process.env.DIDIT_WORKFLOW_ID
  const userId = String(ev.vendor_data || '')

  if (ev.status === 'Approved' && !ehTeste && nossoFluxo && UUID.test(userId)) {
    const admin = createAdminClient()
    const { error } = await admin.auth.admin.updateUserById(userId, {
      app_metadata: {
        idade_verificada: true,
        idade_verificada_em: new Date().toISOString(),
        idade_verificada_sessao: String(ev.session_id || ''),
      },
    })
    if (error) {
      console.error('[didit] não marcou a conta', error.message)
      return NextResponse.json({ error: 'falha ao gravar' }, { status: 500 }) // a Didit tenta de novo
    }
  }
  return NextResponse.json({ received: true })
}
