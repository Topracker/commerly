import type { SupabaseClient } from '@supabase/supabase-js'
import type Stripe from 'stripe'
import { pctIndicacoes, precoBase, precoComDesconto, brl } from './precos'
import { aplicarDescontoAssinatura } from './stripeMensalidade'

// ============================================================================
// DESCONTO POR INDICAÇÃO — o motor
// ----------------------------------------------------------------------------
// Regra: uma indicação só CONTA quando o indicado ASSINA. Cadastro não vale —
// senão bastaria criar contas para zerar a mensalidade. O marco disso é
// `indicacoes.assinou_em`: enquanto for null, a indicação existe (a pessoa
// entrou pelo convite) mas não gera desconto nenhum.
//
// Quem indica: 10% por indicação confirmada, até 40% (ver lib/precos.ts). O
// cupom é `forever` — vale enquanto ele mantiver a assinatura.
// Quem foi indicado: leva o percentual que o indicador tinha NA HORA em que ele
// assinou, uma vez só (cupom `once`), na primeira cobrança.
//
// Substituiu o "1 mês grátis por indicação" (crédito no saldo do cliente
// Stripe), que era caro, mexia em `beneficios_indicacao` e não escalava.
// ============================================================================

/** Indicações deste usuário que já viraram assinatura. */
export async function contarConfirmadas(admin: SupabaseClient, indicadorUserId: string): Promise<number> {
  const { count } = await admin
    .from('indicacoes')
    .select('id', { count: 'exact', head: true })
    .eq('indicador_user_id', indicadorUserId)
    .not('assinou_em', 'is', null)
  return count || 0
}

/** Situação do desconto de quem indica. */
export async function descontoDoIndicador(
  admin: SupabaseClient, userId: string,
): Promise<{ confirmadas: number; pct: number }> {
  const confirmadas = await contarConfirmadas(admin, userId)
  return { confirmadas, pct: pctIndicacoes(confirmadas) }
}

/**
 * Desconto de boas-vindas de quem entrou por convite: o mesmo percentual que o
 * indicador tem agora. Zero se a pessoa não veio de convite — ou se já assinou
 * antes (o benefício é da primeira assinatura).
 */
export async function descontoDeBoasVindas(
  admin: SupabaseClient, indicadoUserId: string,
): Promise<{ pct: number; indicadorUserId: string | null }> {
  const { data: ind } = await admin
    .from('indicacoes')
    .select('indicador_user_id, assinou_em')
    .eq('indicado_user_id', indicadoUserId)
    .maybeSingle()

  if (!ind?.indicador_user_id || ind.assinou_em) return { pct: 0, indicadorUserId: null }
  const { pct } = await descontoDoIndicador(admin, ind.indicador_user_id)
  return { pct, indicadorUserId: ind.indicador_user_id }
}

/**
 * O indicado assinou: confirma a indicação, recalcula o desconto do indicador,
 * aplica na assinatura dele e avisa.
 *
 * Idempotente: o UPDATE só pega a linha com `assinou_em is null`, então uma
 * reentrega do webhook da Stripe não confirma duas vezes nem notifica de novo.
 */
export async function confirmarIndicacaoAssinatura(
  admin: SupabaseClient, stripe: Stripe | null, indicadoUserId: string,
): Promise<{ confirmada: boolean; pct?: number }> {
  const { data: linhas } = await admin
    .from('indicacoes')
    .update({ assinou_em: new Date().toISOString(), status: 'confirmada' })
    .eq('indicado_user_id', indicadoUserId)
    .is('assinou_em', null)
    .select('id, indicador_user_id, codigo')

  const ind = linhas?.[0]
  if (!ind?.indicador_user_id) return { confirmada: false }

  const { confirmadas, pct } = await descontoDoIndicador(admin, ind.indicador_user_id)

  await admin.from('indicacoes')
    .update({ desconto_pct: pct, recompensa: `${pct}% de desconto na mensalidade` })
    .eq('id', ind.id)

  // Loja do indicador (para aplicar o cupom) e nome de quem assinou.
  const [{ data: lojaIndicador }, { data: lojaIndicado }] = await Promise.all([
    admin.from('lojas').select('id, fundador, stripe_subscription_id').eq('user_id', ind.indicador_user_id).maybeSingle(),
    admin.from('lojas').select('nome').eq('user_id', indicadoUserId).maybeSingle(),
  ])

  if (stripe && lojaIndicador?.stripe_subscription_id && pct > 0) {
    try {
      await aplicarDescontoAssinatura(stripe, lojaIndicador.stripe_subscription_id, pct, 'forever')
    } catch (e) {
      // O desconto não se perde: /api/stripe/aplicar-desconto reconcilia no
      // próximo acesso ao dashboard.
      console.error('[indicacaoDesconto] falha ao aplicar cupom na Stripe:', e)
    }
  }

  const nome = lojaIndicado?.nome || 'Sua indicação'
  const novoPreco = precoComDesconto(precoBase(lojaIndicador?.fundador), pct)

  await admin.from('notificacoes').insert({
    user_id: ind.indicador_user_id,
    tipo: 'convite',
    titulo: '🎉 Sua indicação assinou!',
    mensagem: `Sua indicação ${nome} assinou! Você agora tem ${pct}% de desconto — sua mensalidade cai para ${brl(novoPreco)}.`,
    link: '/embaixador',
    dados: { codigo: ind.codigo, confirmadas, pct },
  })

  await admin.from('feed_conquistas').insert({
    tipo: 'entrou',
    texto: `🎉 ${nome} assinou a Commerly por indicação`,
  })

  return { confirmada: true, pct }
}

/**
 * Mesma coisa, a partir da loja que acabou de assinar — é o que o webhook da
 * Stripe tem em mãos (id da loja ou da assinatura).
 */
export async function confirmarIndicacaoDaLoja(
  admin: SupabaseClient, stripe: Stripe | null,
  filtro: { lojaId?: string | null; subscriptionId?: string | null },
): Promise<void> {
  let q = admin.from('lojas').select('user_id')
  if (filtro.lojaId) q = q.eq('id', filtro.lojaId)
  else if (filtro.subscriptionId) q = q.eq('stripe_subscription_id', filtro.subscriptionId)
  else return

  const { data: loja } = await q.maybeSingle()
  if (!loja?.user_id) return
  await confirmarIndicacaoAssinatura(admin, stripe, loja.user_id)
}
