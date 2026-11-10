import { NextResponse } from 'next/server'
import { createAdminClient } from '../../../../lib/supabase-admin'
import { EDI_INTERVALO_MANUAL_MS } from '../../../../lib/pagbankEdi'
import { sincronizarLojaEdi } from '../../../../lib/pagbankEdiSync'
import { lojaDaSessao } from '../sessao'

// "Sincronizar agora". Passa pelo paywall do proxy (/api/maquininha/*).
// Limite de 1 a cada 10 min por loja, gravado no banco: o rate limit em memória
// não vale entre instâncias, e a API do PagBank não é nossa para abusar.

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST() {
  const sessao = await lojaDaSessao()
  if (!sessao) return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 })

  const admin = createAdminClient()
  const inicio = Date.now()
  const limite = new Date(inicio - EDI_INTERVALO_MANUAL_MS).toISOString()
  // Reserva atômica: só uma requisição por janela consegue marcar o horário.
  const { data: reservada, error } = await admin.from('pagbank_edi_conexoes')
    .update({ sync_manual_em: new Date(inicio).toISOString() })
    .eq('loja_id', sessao.lojaId)
    .or(`sync_manual_em.is.null,sync_manual_em.lt.${limite}`)
    .select('loja_id')
  if (error) return NextResponse.json({ erro: 'Não foi possível sincronizar agora.' }, { status: 500 })
  if (!reservada?.length) {
    const { data: con } = await admin.from('pagbank_edi_conexoes').select('sync_manual_em').eq('loja_id', sessao.lojaId).maybeSingle()
    if (!con) return NextResponse.json({ erro: 'Cadastre a maquininha PagBank em Configurações.' }, { status: 400 })
    const proxima = new Date(new Date(String(con.sync_manual_em)).getTime() + EDI_INTERVALO_MANUAL_MS)
    const min = Math.max(1, Math.ceil((proxima.getTime() - inicio) / 60_000))
    return NextResponse.json({ erro: `Você já sincronizou há pouco. Tente de novo em ${min} min.` }, { status: 429 })
  }

  const r = await sincronizarLojaEdi(admin, sessao.lojaId, 'manual', { prazo: inicio + 45_000 })
  return NextResponse.json({
    ok: r.ok,
    status: r.status,
    novas: r.novas,
    mensagem: r.mensagem,
    dias: r.dias.map(d => ({ dia: d.dia, validado: d.validado, novas: d.novas, canceladas: d.canceladas + d.ajustadas })),
  }, { status: r.ok ? 200 : 502 })
}
