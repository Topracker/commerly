import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createAdminClient } from '../../../lib/supabase-admin'
import { supabaseDaRota, usuarioDaRota } from '../../../lib/rotaSupabase'
import { rateLimit } from '../../../lib/rate-limit'
import { enviarEmail } from '../../../lib/email'
import {
  type Checagem, cancelarAssinaturasDaLoja, contaProtegida, templateExclusaoSolicitada, traduzirErroSql,
} from '../../../lib/exclusaoConta'

export const runtime = 'nodejs'

// ============================================================================
// /api/conta/excluir — qualquer papel, exige sessão.
//   GET  → pré-checagem: papel, bloqueios (o que resolver antes) e avisos.
//   POST → confirma. Efeito imediato e reversível por 30 dias (ver SQL).
//
// A sessão pode ter nascido de senha, Google ou do link da página pública
// (/excluir-conta → e-mail → verifyOtp). Para todas a confirmação é a mesma:
// digitar o e-mail da conta + a palavra EXCLUIR (conta Google não tem senha).
// ============================================================================

export async function GET() {
  const supabase = await supabaseDaRota()
  const user = await usuarioDaRota(supabase)
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (!rateLimit(`conta-excluir-get:${user.id}`, 30, 60_000)) {
    return NextResponse.json({ error: 'Muitas tentativas' }, { status: 429 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin.rpc('checar_exclusao_conta', { p_user_id: user.id })
  if (error) {
    console.error('[conta/excluir GET] checar falhou:', error.message)
    return NextResponse.json({ error: 'Falha ao consultar a conta' }, { status: 500 })
  }
  const c = data as Checagem
  return NextResponse.json({
    ...c,
    email: user.email ?? null,
    protegida: contaProtegida(user.email),
  })
}

export async function POST(request: NextRequest) {
  const supabase = await supabaseDaRota()
  const user = await usuarioDaRota(supabase)
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (!rateLimit(`conta-excluir:${user.id}`, 3, 600_000)) {
    return NextResponse.json({ error: 'Muitas tentativas. Aguarde alguns minutos.' }, { status: 429 })
  }

  const body = await request.json().catch(() => ({}))
  const emailDigitado = String(body?.email || '').trim().toLowerCase()
  const confirmacao = String(body?.confirmacao || '').trim().toUpperCase()
  const origem = body?.origem === 'web' ? 'web' : 'app'

  if (!user.email || emailDigitado !== user.email.toLowerCase()) {
    return NextResponse.json({ error: 'O e-mail digitado não confere com o da conta.' }, { status: 400 })
  }
  if (confirmacao !== 'EXCLUIR') {
    return NextResponse.json({ error: 'Digite EXCLUIR para confirmar.' }, { status: 400 })
  }
  if (contaProtegida(user.email)) {
    return NextResponse.json({ error: 'Esta conta não pode ser excluída por aqui.' }, { status: 403 })
  }

  const admin = createAdminClient()

  // Pré-checagem de novo no servidor: a tela pode estar velha.
  const { data: checagem, error: errCheca } = await admin.rpc('checar_exclusao_conta', { p_user_id: user.id })
  if (errCheca) {
    console.error('[conta/excluir] checar falhou:', errCheca.message)
    return NextResponse.json({ error: 'Falha ao consultar a conta' }, { status: 500 })
  }
  const c = checagem as Checagem
  if (c.pendente) return NextResponse.json({ error: 'A exclusão desta conta já foi solicitada.', pendente: c.pendente }, { status: 409 })
  if (c.bloqueios.length > 0) {
    return NextResponse.json({ error: 'Há pendências que precisam ser resolvidas antes.', bloqueios: c.bloqueios }, { status: 409 })
  }

  // 1) Stripe primeiro (decisão 4: cancela na hora, sem pro-rata). Se falhar,
  //    nada muda no banco — a pessoa tenta de novo.
  if (c.papel === 'comerciante' && c.perfil_id) {
    const { data: loja } = await admin
      .from('lojas').select('stripe_subscription_id, stripe_ads_subscription_id').eq('id', c.perfil_id).maybeSingle()
    const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null
    const r = await cancelarAssinaturasDaLoja(stripe, loja || {})
    if (!r.ok) {
      console.error('[conta/excluir] Stripe falhou:', r.erro)
      return NextResponse.json({ error: 'Não foi possível cancelar a assinatura agora. Tente novamente em instantes.' }, { status: 502 })
    }
  }

  // 2) Banco: marca, esconde, agenda.
  const { data, error } = await admin.rpc('solicitar_exclusao_conta', {
    p_user_id: user.id, p_email: user.email, p_origem: origem,
  })
  if (error) {
    const t = traduzirErroSql(error.message)
    if (t.status === 500) console.error('[conta/excluir] solicitar falhou:', error.message)
    return NextResponse.json({ error: t.erro, bloqueios: t.bloqueios }, { status: t.status })
  }
  const resultado = data as { id: string; papel: string | null; executa_apos: string }

  // 3) Derruba as outras sessões (best-effort). A desta aba cai no cliente.
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.access_token) await admin.auth.admin.signOut(session.access_token, 'global')
  } catch (e) {
    console.warn('[conta/excluir] signOut global falhou:', e instanceof Error ? e.message : e)
  }

  // 4) E-mail com a data e como desistir.
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, '') || 'https://commerly.com.br'
  const { html, texto } = templateExclusaoSolicitada(resultado.executa_apos, `${base}/conta/agendada`)
  const envio = await enviarEmail({ para: user.email, assunto: 'Recebemos seu pedido de exclusão — Commerly', html, texto })
  if (!envio.ok) console.error('[conta/excluir] Resend falhou:', envio.erro)

  return NextResponse.json({ ok: true, executa_apos: resultado.executa_apos, papel: resultado.papel })
}
