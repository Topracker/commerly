// ============================================================================
// Repasse ao entregador via Stripe Connect — corrida + gorjeta e bônus de
// indicação. Fonte ÚNICA usada por:
//   - /api/entregador/confirmar-entrega  (na hora da entrega)
//   - /api/repasse/cron                  (retry diário — o Hobby não deixa sub-diário)
//
// Por que existe: antes, se o transfer falhasse no confirmar-entrega, o pedido
// ficava com pagamento_corrida='pendente' para sempre, sem retry e sem aviso.
// Agora cada tentativa grava repasse_tentativas/repasse_tentado_em/repasse_erro
// e o que continua travado aparece em Admin → Acertos → "Repasses travados".
//
// DINHEIRO NÃO SAI DUAS VEZES (três travas):
//   1. `transfer_group` fixo por pedido/indicação; antes de criar, procuramos um
//      transfer já existente nesse grupo (cobre o caso "transfer saiu, o UPDATE
//      no banco falhou" — a chave de idempotência da Stripe vence em 24h e o
//      cron roda dias depois).
//   2. Idempotency key fixa (`corrida-<pedido>` / `indicacao-<id>`) para duas
//      chamadas simultâneas no mesmo dia.
//   3. O filtro da leitura (`pagamento_corrida='pendente'` / `bonus_pago_em is null`).
//
// Só o service role escreve essas colunas (guard de pedidos_clientes; RLS sem
// policy em `indicacoes`).
// ============================================================================

import Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'

import { BONUS_INDICACAO_ENTREGADOR } from './convite'
export { BONUS_INDICACAO_ENTREGADOR }

export type ResultadoRepasse = { pago: boolean; valor: number; erro?: string; transferId?: string }

const centavos = (v: number) => Math.round(v * 100)

function stripeOuNull(): Stripe | null {
  return process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null
}

/** Transfer já criado neste grupo? (trava 1) */
async function transferExistente(stripe: Stripe, grupo: string): Promise<Stripe.Transfer | null> {
  const lista = await stripe.transfers.list({ transfer_group: grupo, limit: 1 })
  return lista.data[0] ?? null
}

async function transferir(
  stripe: Stripe, args: { valor: number; destino: string; grupo: string; chave: string; metadata: Record<string, string> },
): Promise<Stripe.Transfer> {
  const ja = await transferExistente(stripe, args.grupo)
  if (ja) return ja
  return stripe.transfers.create({
    amount: centavos(args.valor),
    currency: 'brl',
    destination: args.destino,
    transfer_group: args.grupo,
    metadata: args.metadata,
  }, { idempotencyKey: args.chave })
}

function mensagemErro(e: unknown): string {
  const s = e as { code?: string; message?: string }
  if (s?.code === 'balance_insufficient') return 'Saldo insuficiente na Stripe da plataforma (aguardando o pagamento do cliente cair).'
  return (s?.message || String(e)).slice(0, 300)
}

/**
 * Paga a corrida (valor_corrida + gorjeta) de um pedido ENTREGUE e PAGO ONLINE.
 * Pedido em dinheiro/vale não passa por aqui: o entregador já ficou com a taxa
 * na porta (Caminho B, lib/acertos.ts) e a gorjeta é dada em mãos.
 */
export async function pagarCorrida(admin: SupabaseClient, pedidoId: string): Promise<ResultadoRepasse> {
  const { data: p } = await admin.from('pedidos_clientes')
    .select('id, status, entregador_id, valor_corrida, gorjeta, pagamento_metodo, pagamento_status, pagamento_corrida, repasse_tentativas')
    .eq('id', pedidoId).maybeSingle()
  if (!p) return { pago: false, valor: 0, erro: 'Pedido não encontrado.' }
  const valor = Math.round(((Number(p.valor_corrida) || 0) + (Number(p.gorjeta) || 0)) * 100) / 100
  if (p.pagamento_corrida === 'pago') return { pago: true, valor }
  if (p.status !== 'entregue' || p.pagamento_metodo !== 'online' || p.pagamento_status !== 'pago' || !p.entregador_id || valor <= 0) {
    return { pago: false, valor, erro: 'Pedido não elegível a repasse online.' }
  }

  const registrar = async (campos: Record<string, unknown>) => {
    const { data, error } = await admin.from('pedidos_clientes').update({
      ...campos,
      repasse_tentativas: (p.repasse_tentativas || 0) + 1,
      repasse_tentado_em: new Date().toISOString(),
    }).eq('id', pedidoId).select('id')
    if (error || !data?.length) console.error('[repasse] falha ao gravar tentativa', pedidoId, error?.message)
    return !error && !!data?.length
  }

  const { data: ent } = await admin.from('entregadores')
    .select('id, stripe_account_id, stripe_onboarded').eq('id', p.entregador_id).maybeSingle()
  if (!ent?.stripe_account_id || !ent.stripe_onboarded) {
    const erro = 'Entregador sem Stripe Connect concluído (onboarding de recebimentos).'
    await registrar({ repasse_erro: erro })
    return { pago: false, valor, erro }
  }
  const stripe = stripeOuNull()
  if (!stripe) {
    const erro = 'STRIPE_SECRET_KEY ausente no servidor.'
    await registrar({ repasse_erro: erro })
    return { pago: false, valor, erro }
  }

  try {
    const t = await transferir(stripe, {
      valor, destino: ent.stripe_account_id,
      grupo: `corrida-${pedidoId}`, chave: `corrida-${pedidoId}`,
      metadata: {
        pedido_id: pedidoId, entregador_id: ent.id,
        corrida: String(Number(p.valor_corrida) || 0), gorjeta: String(Number(p.gorjeta) || 0),
      },
    })
    await registrar({ pagamento_corrida: 'pago', stripe_transfer_id: t.id, repasse_erro: null })
    return { pago: true, valor, transferId: t.id }
  } catch (e) {
    const erro = mensagemErro(e)
    console.error('[repasse] transfer da corrida falhou', pedidoId, erro)
    await registrar({ repasse_erro: erro })
    return { pago: false, valor, erro }
  }
}

/**
 * Bônus de indicação entre entregadores: R$30 ao INDICADOR quando o INDICADO
 * completa 5 corridas entregues (código conferido). Chamado a cada entrega do
 * indicado e pelo cron. Idempotente.
 */
export async function verificarBonusIndicacao(admin: SupabaseClient, entregadorIndicadoId: string): Promise<ResultadoRepasse | null> {
  const { data: indicado } = await admin.from('entregadores').select('id, user_id').eq('id', entregadorIndicadoId).maybeSingle()
  if (!indicado?.user_id) return null
  const { data: ind } = await admin.from('indicacoes')
    .select('id, indicador_user_id, bonus_valor, bonus_meta_corridas, bonus_tentativas, bonus_pago_em')
    .eq('indicado_user_id', indicado.user_id).not('bonus_valor', 'is', null).is('bonus_pago_em', null).maybeSingle()
  if (!ind) return null
  return pagarBonusIndicacao(admin, ind, indicado.id)
}

type LinhaIndicacao = {
  id: string; indicador_user_id: string; bonus_valor: number | null
  bonus_meta_corridas: number | null; bonus_tentativas: number | null; bonus_pago_em: string | null
}

export async function pagarBonusIndicacao(admin: SupabaseClient, ind: LinhaIndicacao, indicadoEntregadorId: string): Promise<ResultadoRepasse> {
  const valor = Number(ind.bonus_valor) || 0
  if (ind.bonus_pago_em) return { pago: true, valor }
  const meta = ind.bonus_meta_corridas || BONUS_INDICACAO_ENTREGADOR.corridas

  // Só corrida ENTREGUE conta (o código do cliente foi conferido). Não adianta
  // indicar e sumir: o bônus não sai adiantado.
  const { count } = await admin.from('pedidos_clientes').select('id', { count: 'exact', head: true })
    .eq('entregador_id', indicadoEntregadorId).eq('status', 'entregue')
  if ((count || 0) < meta) return { pago: false, valor, erro: `Indicado com ${count || 0}/${meta} corridas.` }

  const registrar = async (campos: Record<string, unknown>) => {
    const { error } = await admin.from('indicacoes').update({
      ...campos, bonus_tentativas: (ind.bonus_tentativas || 0) + 1,
    }).eq('id', ind.id)
    if (error) console.error('[repasse] falha ao gravar bônus', ind.id, error.message)
  }

  const { data: indicador } = await admin.from('entregadores')
    .select('id, stripe_account_id, stripe_onboarded').eq('user_id', ind.indicador_user_id).maybeSingle()
  if (!indicador?.stripe_account_id || !indicador.stripe_onboarded) {
    const erro = 'Indicador sem Stripe Connect concluído (onboarding de recebimentos).'
    await registrar({ bonus_erro: erro })
    return { pago: false, valor, erro }
  }
  const stripe = stripeOuNull()
  if (!stripe) {
    const erro = 'STRIPE_SECRET_KEY ausente no servidor.'
    await registrar({ bonus_erro: erro })
    return { pago: false, valor, erro }
  }
  try {
    const t = await transferir(stripe, {
      valor, destino: indicador.stripe_account_id,
      grupo: `indicacao-${ind.id}`, chave: `indicacao-${ind.id}`,
      metadata: { indicacao_id: ind.id, indicador_entregador_id: indicador.id, indicado_entregador_id: indicadoEntregadorId, tipo: 'bonus_indicacao_entregador' },
    })
    await registrar({ bonus_pago_em: new Date().toISOString(), bonus_transfer_id: t.id, bonus_erro: null, status: 'recompensada' })
    try {
      await admin.from('notificacoes').insert({
        user_id: ind.indicador_user_id, tipo: 'acerto',
        titulo: 'Bônus de indicação pago 🎉',
        mensagem: `Seu indicado completou ${meta} corridas: R$ ${valor.toFixed(2).replace('.', ',')} foram para a sua conta.`,
        link: '/entregador-delivery/dashboard', dados: { indicacao_id: ind.id },
      })
    } catch { /* notificação é cortesia; o dinheiro já saiu */ }
    return { pago: true, valor, transferId: t.id }
  } catch (e) {
    const erro = mensagemErro(e)
    console.error('[repasse] transfer do bônus falhou', ind.id, erro)
    await registrar({ bonus_erro: erro })
    return { pago: false, valor, erro }
  }
}
