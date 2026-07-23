// #10 Commerly Garantia — varredura periódica (Vercel Cron, ver vercel.json).
//
// Procura pedidos ainda não entregues cujo ETA estourou há mais de 30 min e
// que ainda não geraram cupom. Emite um cupom de 10% da PLATAFORMA e notifica
// o cliente.
//
// Idempotência: `pedidos_clientes.garantia_cupom_id` é preenchido junto e o
// filtro exige que esteja nulo, então um pedido nunca gera dois cupons — mesmo
// se o cron rodar duas vezes ou sobrepor execuções.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '../../../lib/supabase-admin'
import { gerarCodigo } from '../../../lib/cupons'
import { enviarPushParaUsuario, pushConfigurado } from '../../../lib/push'
import { prazoEstourado, expiraEm, DESCONTO_PCT, ORIGEM, TITULO_PUSH, MENSAGEM_PUSH } from '../../../lib/garantia'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Teto por execução, para o cron não estourar o tempo em caso de acúmulo. */
const LOTE = 50

export async function GET(req: NextRequest) {
  // Fail-closed: sem CRON_SECRET configurada, ninguém entra (o endpoint não fica
  // aberto se a env var sumir). Vercel Cron envia "Authorization: Bearer
  // <CRON_SECRET>" automaticamente quando a env var existe.
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 })
  }

  const admin = createAdminClient()
  const agora = new Date()

  const { data: pedidos, error } = await admin
    .from('pedidos_clientes')
    .select('id, cliente_id, loja_id, eta_em, status, total')
    .is('garantia_cupom_id', null)
    .not('eta_em', 'is', null)
    .in('status', ['recebido', 'preparando', 'saiu'])
    .lt('eta_em', new Date(agora.getTime() - 30 * 60_000).toISOString())
    .limit(LOTE)

  if (error) {
    console.error('[garantia cron] erro ao listar pedidos:', error.message)
    return NextResponse.json({ erro: 'Erro ao listar pedidos.' }, { status: 500 })
  }

  let emitidos = 0
  const falhas: string[] = []

  for (const p of pedidos ?? []) {
    // O filtro do SQL já garante isso; confirmamos com a mesma regra do domínio
    // para não depender de aritmética de data espalhada em dois lugares.
    if (!prazoEstourado(p.eta_em as string, agora)) continue

    const { data: cliente } = await admin
      .from('clientes').select('user_id').eq('id', p.cliente_id).maybeSingle()

    const { data: cupom, error: cupomErr } = await admin
      .from('cupons')
      .insert({
        codigo: gerarCodigo('DESCULPA'),
        // Cupom da plataforma: vale em qualquer loja e não sai do bolso do comerciante.
        loja_id: null,
        cliente_id: p.cliente_id,
        tipo: 'percentual',
        valor: DESCONTO_PCT,
        minimo: 0,
        origem: ORIGEM,
        expira_em: expiraEm(agora).toISOString(),
        pedido_id: p.id,
      })
      .select('id, codigo')
      .single()

    if (cupomErr || !cupom) {
      console.error('[garantia cron] falha ao criar cupom do pedido', p.id, cupomErr?.message)
      falhas.push(p.id)
      continue
    }

    // Marca o pedido ANTES de notificar: se o push falhar, não reemitimos cupom.
    const { error: marcaErr } = await admin
      .from('pedidos_clientes')
      .update({ garantia_cupom_id: cupom.id })
      .eq('id', p.id)
      .is('garantia_cupom_id', null)

    if (marcaErr) {
      console.error('[garantia cron] falha ao marcar pedido', p.id, marcaErr.message)
      falhas.push(p.id)
      continue
    }

    emitidos++

    if (!cliente?.user_id) continue

    // Notificação in-app (tipo 'cupom' já existe no CHECK de notificacoes.tipo).
    await admin.from('notificacoes').insert({
      user_id: cliente.user_id,
      tipo: 'cupom',
      titulo: TITULO_PUSH,
      mensagem: `${MENSAGEM_PUSH} Código: ${cupom.codigo}`,
      link: '/cliente/dashboard',
      dados: { cupom_id: cupom.id, pedido_id: p.id, origem: ORIGEM },
    })

    if (pushConfigurado()) {
      await enviarPushParaUsuario(admin, cliente.user_id, {
        titulo: TITULO_PUSH,
        mensagem: MENSAGEM_PUSH,
        link: '/cliente/dashboard',
        tipo: 'cupom',
        tag: 'garantia',
      })
    }
  }

  return NextResponse.json({ analisados: pedidos?.length ?? 0, emitidos, falhas: falhas.length })
}
