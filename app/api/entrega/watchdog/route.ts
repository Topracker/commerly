import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '../../../lib/supabase-admin'
import { supabaseDaRota, usuarioDaRota } from '../../../lib/rotaSupabase'
import { rateLimit } from '../../../lib/rate-limit'
import { rodarWatchdog } from '../../../lib/despachoWatchdog'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

// WATCHDOG DE DESPACHO — mantém a cadeia de ofertas andando no SERVIDOR.
//
// Dois modos de acionamento:
//
//   POST  (comerciante logado) — varre só os pedidos da própria loja. O painel
//         /pedidos chama isto a cada 30s enquanto está aberto, o que dá reação
//         rápida sem depender de cron.
//   GET   (Vercel Cron / CRON_SECRET) — varre a plataforma inteira.
//
// O plano Hobby da Vercel só aceita cron DIÁRIO, então o GET é faxina/rede de
// segurança, não o motor. Quem mantém a cadeia andando em tempo real são os
// dois gatilhos vindos do app: este POST (painel do comerciante aberto) e
// /api/entrega/checar-entregador (tela de acompanhamento do cliente aberta).
//
// Toda a decisão (ofertar ao próximo, marcar esgotado, liberar para o pool,
// alertar 15/30 min) mora em lib/despachoWatchdog.ts — o cliente não escolhe
// nada, só pede a passada.

export async function POST(request: NextRequest) {
  const supabase = await supabaseDaRota()
  const user = await usuarioDaRota(supabase)
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (!rateLimit(`watchdog:${user.id}`, 30, 60_000)) {
    return NextResponse.json({ error: 'Muitas tentativas. Aguarde.' }, { status: 429 })
  }

  const admin = createAdminClient()
  const { data: loja } = await admin.from('lojas').select('id').eq('user_id', user.id).maybeSingle()
  if (!loja) return NextResponse.json({ error: 'Loja não encontrada.' }, { status: 403 })

  try {
    const resultados = await rodarWatchdog(admin, loja.id)
    return NextResponse.json({ ok: true, pedidos: resultados })
  } catch (e) {
    console.error('[entrega/watchdog] erro:', e)
    return NextResponse.json({ error: 'Erro no watchdog de despacho.' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  // Fail-closed: sem CRON_SECRET configurada, o cron público não roda (só o POST
  // autenticado do comerciante mantém a cadeia andando). Vercel Cron envia
  // "Authorization: Bearer <CRON_SECRET>" quando a env var existe.
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const admin = createAdminClient()
  try {
    const resultados = await rodarWatchdog(admin)
    return NextResponse.json({ ok: true, total: resultados.length, pedidos: resultados })
  } catch (e) {
    console.error('[entrega/watchdog] erro no cron:', e)
    return NextResponse.json({ error: 'Erro no watchdog de despacho.' }, { status: 500 })
  }
}
