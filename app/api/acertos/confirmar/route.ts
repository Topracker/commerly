import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '../../../lib/supabase-admin'
import { rateLimit } from '../../../lib/rate-limit'
import { dispatchPushPedido } from '../../../lib/pushDispatch'
import { reais, type Acerto, type PapelConfirmacao } from '../../../lib/acertos'

// Confirmação (ou contestação) de um acerto em dinheiro pela parte que RECEBE.
//
// Roda com service role porque `acertos_confirmacoes` não tem policy de escrita
// para authenticated e porque `pedidos_clientes.pagamento_status` só pode ser
// escrito por service role (guard, patch (c) de 2026-09-20). O papel de quem
// chama é DERIVADO da sessão — o body não diz "sou a loja":
//   • dono da loja do acerto      → papel 'loja'       (para_papel deve ser 'loja')
//   • entregador do acerto        → papel 'entregador' (para_papel deve ser 'entregador')
// Loja confirmando um `repasse_loja` é o que vira o pedido em 'pago'.
export async function POST(request: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } },
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (!rateLimit(`acertos-confirmar:${user.id}`, 30, 60_000)) {
    return NextResponse.json({ error: 'Muitas tentativas. Aguarde um instante.' }, { status: 429 })
  }

  const body = await request.json().catch(() => ({}))
  const acertoId = typeof body?.acerto_id === 'string' ? body.acerto_id : null
  const resultado = body?.resultado === 'contestado' ? 'contestado' : body?.resultado === 'confirmado' ? 'confirmado' : null
  const observacao = typeof body?.observacao === 'string' ? body.observacao.trim().slice(0, 300) || null : null
  if (!acertoId || !resultado) {
    return NextResponse.json({ error: 'Informe o acerto e o resultado (confirmado/contestado).' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: acerto } = await admin.from('acertos_dinheiro').select('*').eq('id', acertoId).maybeSingle()
  if (!acerto) return NextResponse.json({ error: 'Acerto não encontrado.' }, { status: 404 })
  const a = acerto as Acerto
  if (a.estorna_id || a.tipo === 'estorno') {
    return NextResponse.json({ error: 'Estornos não se confirmam.' }, { status: 409 })
  }

  // Quem é o chamador em relação a ESTE acerto?
  let papel: PapelConfirmacao | null = null
  if (a.para_papel === 'loja') {
    const { data: loja } = await admin.from('lojas').select('id').eq('id', a.loja_id).eq('user_id', user.id).maybeSingle()
    if (loja) papel = 'loja'
  } else if (a.para_papel === 'entregador' && a.entregador_id) {
    const { data: ent } = await admin.from('entregadores').select('id').eq('id', a.entregador_id).eq('user_id', user.id).maybeSingle()
    if (ent) papel = 'entregador'
  }
  if (!papel) return NextResponse.json({ error: 'Só quem recebe este valor pode confirmar.' }, { status: 403 })

  const { data: existentes } = await admin
    .from('acertos_confirmacoes').select('id, resultado').eq('acerto_id', acertoId).eq('papel', papel)
  if ((existentes || []).some(c => c.resultado === 'confirmado')) {
    return NextResponse.json({ error: 'Este acerto já foi confirmado.' }, { status: 409 })
  }

  const { data: conf, error: confErr } = await admin
    .from('acertos_confirmacoes')
    .insert({ acerto_id: acertoId, papel, resultado, user_id: user.id, origem: 'app', observacao })
    .select('id').single()
  if (confErr || !conf) return NextResponse.json({ error: 'Não foi possível registrar.' }, { status: 500 })

  // Loja confirmou o repasse: o pedido está pago. `.select()` + contagem porque
  // o guard/RLS recusam em silêncio (204, zero linhas) — regra 9 do CLAUDE.md.
  let pedidoPago = false
  if (papel === 'loja' && resultado === 'confirmado' && (a.tipo === 'repasse_loja' || a.tipo === 'cobranca')) {
    const { data: upd, error: updErr } = await admin
      .from('pedidos_clientes').update({ pagamento_status: 'pago' })
      .eq('id', a.pedido_id).eq('pagamento_status', 'pendente').select('id')
    if (updErr) console.error('[acertos/confirmar] pagamento_status:', updErr.message)
    pedidoPago = !!upd && upd.length > 0
    if (!pedidoPago && !updErr) {
      // Já estava pago (ex.: outra confirmação venceu a corrida) — não é erro.
      const { data: p } = await admin.from('pedidos_clientes').select('pagamento_status').eq('id', a.pedido_id).maybeSingle()
      pedidoPago = p?.pagamento_status === 'pago'
    }
  }

  // Avisa a contraparte (best-effort). Contestação também avisa a equipe pelo
  // painel de gestão (lista de contestados) — sem e-mail aqui.
  try {
    let destino: string | null = null
    let titulo = ''
    let msg = ''
    let link = '/'
    if (a.de_papel === 'entregador' && a.entregador_id) {
      const { data: e } = await admin.from('entregadores').select('user_id').eq('id', a.entregador_id).maybeSingle()
      destino = e?.user_id || null
      link = '/entregador-delivery/dashboard'
      titulo = resultado === 'confirmado' ? 'Repasse confirmado ✅' : 'Repasse contestado ⚠️'
      msg = resultado === 'confirmado'
        ? `A loja confirmou o recebimento de ${reais(a.valor)}.`
        : `A loja diz que não recebeu ${reais(a.valor)}.${observacao ? ' "' + observacao + '"' : ''} Fale com ela.`
    } else if (a.de_papel === 'loja') {
      const { data: l } = await admin.from('lojas').select('user_id').eq('id', a.loja_id).maybeSingle()
      destino = l?.user_id || null
      link = '/pedidos'
      titulo = resultado === 'confirmado' ? 'Acerto confirmado ✅' : 'Acerto contestado ⚠️'
      msg = `${reais(a.valor)} — ${resultado === 'confirmado' ? 'confirmado pelo entregador.' : 'o entregador contestou.'}`
    }
    if (destino) {
      await admin.from('notificacoes').insert({
        user_id: destino, tipo: 'acerto', titulo, mensagem: msg, link,
        dados: { pedido_id: a.pedido_id, acerto_id: a.id },
      })
      await dispatchPushPedido(admin, a.pedido_id)
    }
  } catch (e) {
    console.error('[acertos/confirmar] aviso falhou:', e)
  }

  return NextResponse.json({ ok: true, confirmacao_id: conf.id, papel, resultado, pedido_pago: pedidoPago })
}
