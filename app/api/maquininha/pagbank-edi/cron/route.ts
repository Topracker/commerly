import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '../../../../lib/supabase-admin'
import { integracoesAtivas } from '../../../../lib/plano'
import { sincronizarLojaEdi } from '../../../../lib/pagbankEdiSync'

// Cron diário da maquininha PagBank (Extrato EDI) — ver vercel.json.
// Duas passadas por dia (07h e 12h de Brasília; o Hobby só aceita diário, então
// são dois crons): o PagBank fecha o dia em D+1, e o dia que ainda não estava
// VALIDADO de manhã é buscado de novo na segunda passada.
//
// O proxy não bloqueia esta rota (tem "cron" no caminho): ela passa sem sessão e
// se protege pelo CRON_SECRET, falhando fechada.

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 })
  }
  const inicio = Date.now()
  const prazo = inicio + 50_000
  const admin = createAdminClient()

  // Quem sincronizou há mais tempo vai primeiro: se o tempo acabar, a próxima
  // passada começa por quem ficou para trás.
  const { data: conexoes, error } = await admin.from('pagbank_edi_conexoes')
    .select('loja_id').order('ultima_sincronizacao', { ascending: true, nullsFirst: true })
  if (error) {
    console.error('[pagbank-edi cron] erro ao listar conexões:', error.message)
    return NextResponse.json({ erro: 'Erro ao listar conexões.' }, { status: 500 })
  }

  let novas = 0, comErro = 0, aguardando = 0, pausadas = 0, feitas = 0
  for (const c of conexoes ?? []) {
    if (Date.now() > prazo) break
    const lojaId = String(c.loja_id)
    // PAYWALL: loja fora do plano fica pausada; ao regularizar, a próxima
    // passada busca os dias que ficaram para trás (até 30).
    if (!(await integracoesAtivas(admin, lojaId))) { pausadas++; continue }
    const r = await sincronizarLojaEdi(admin, lojaId, 'cron', { prazo })
    feitas++
    novas += r.novas
    if (r.status === 'aguardando') aguardando++
    else if (!r.ok) comErro++
  }

  const total = conexoes?.length ?? 0
  console.log('[pagbank-edi cron] lojas:', total, 'feitas:', feitas, 'novas:', novas,
    'aguardando:', aguardando, 'erros:', comErro, 'pausadas:', pausadas)
  return NextResponse.json({ ok: true, lojas: total, feitas, novas, aguardando, erros: comErro, pausadas })
}
