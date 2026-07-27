import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '../../../lib/supabase-admin'
import { supabaseDaRota, usuarioDaRota } from '../../../lib/rotaSupabase'
import { rateLimit } from '../../../lib/rate-limit'
import { erroTelefone } from '../../../lib/validacoes'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Lista de espera do Kit Oficial. O kit não tem checkout (ver /kit e
// app/lib/dispatch.ts: ele nunca foi requisito para rodar), então em vez de um
// botão de compra que não compra, guardamos quem quer ser avisado.
//
// Público de propósito — dá para entrar na fila sem ter conta. Quando o
// visitante ESTÁ logado como entregador, amarramos o registro ao perfil dele.
//
// `kit_interesse` tem RLS ligado e nenhuma policy: guarda nome e telefone de
// gente real, então só o service role toca nela. Mesmo desenho de
// `expansao_interesse`.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const nome = String(body?.nome || '').trim().slice(0, 80)
  const telefone = String(body?.telefone || '').trim().slice(0, 20)

  if (nome.length < 2) {
    return NextResponse.json({ error: 'Informe seu nome.' }, { status: 400 })
  }
  const erroTel = erroTelefone(telefone)
  if (erroTel) return NextResponse.json({ error: erroTel }, { status: 400 })

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip') || 'sem-ip'
  if (!rateLimit(`kit-interesse:${ip}`, 5, 60_000)) {
    return NextResponse.json({ error: 'Muitas tentativas. Aguarde um instante.' }, { status: 429 })
  }

  const admin = createAdminClient()

  // Se houver sessão de entregador, vincula — ajuda a operação a saber quem da
  // base já quer o kit. Falha de sessão não impede o registro.
  let entregador_id: string | null = null
  let user_id: string | null = null
  try {
    const supabase = await supabaseDaRota()
    const user = await usuarioDaRota(supabase).catch(() => null)
    if (user) {
      user_id = user.id
      const { data } = await admin.from('entregadores').select('id').eq('user_id', user.id).maybeSingle()
      entregador_id = data?.id ?? null
    }
  } catch { /* visitante anônimo: segue sem vínculo */ }

  const { error } = await admin
    .from('kit_interesse').insert({ nome, telefone, entregador_id, user_id })

  // 23505 = telefone já na fila. Entrar de novo não é erro para quem envia.
  if (error && error.code !== '23505') {
    console.error('[kit/interesse] erro:', error.message)
    return NextResponse.json({ error: 'Não foi possível registrar. Tente de novo.' }, { status: 500 })
  }

  const { count } = await admin
    .from('kit_interesse').select('id', { count: 'exact', head: true })

  return NextResponse.json({ ok: true, jaEstava: error?.code === '23505', total: count || 1 })
}
