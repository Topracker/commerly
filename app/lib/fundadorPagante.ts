import type { SupabaseClient } from '@supabase/supabase-js'

// Prêmio "Fundador nº 1..3": os 3 primeiros comerciantes REAIS que pagam a
// mensalidade. Toda a regra (corte de data, contas de teste, oculta, valor > 0,
// idempotência e corrida) mora na função SQL `conceder_fundador_pagante` —
// sql/2026-10-25-fundadores-pagantes.sql. Aqui só chamamos.
//
// Chamado do webhook da Stripe DEPOIS de `plano='ativo'`. Nunca lança: o prêmio
// é bônus, e uma falha aqui (inclusive a função ainda não existir em produção)
// não pode virar 500 — a Stripe retentaria e o comerciante não ganharia nada a
// mais por isso.
export async function concederFundadorPagante(
  supabase: SupabaseClient,
  args: { lojaId?: string | null; subscriptionId: string; valorCentavos: number | null | undefined },
): Promise<void> {
  try {
    let lojaId = args.lojaId ?? null
    if (!lojaId) {
      const { data } = await supabase
        .from('lojas').select('id').eq('stripe_subscription_id', args.subscriptionId).maybeSingle()
      lojaId = data?.id ?? null
    }
    if (!lojaId || !((args.valorCentavos ?? 0) > 0)) return

    const { data: ordem, error } = await supabase.rpc('conceder_fundador_pagante', {
      p_loja_id: lojaId,
      p_sub_id: args.subscriptionId,
      p_valor_centavos: args.valorCentavos,
    })
    if (error) {
      console.error('[fundador-pagante] falha ao conceder:', error.message)
      return
    }
    if (ordem) console.log(`[fundador-pagante] loja ${lojaId} é Fundador nº ${ordem}`)
  } catch (e) {
    console.error('[fundador-pagante] erro inesperado:', e)
  }
}

/** Ordem 1..3 da loja no prêmio, ou null. Funciona com o client anon (policy do dono) ou admin. */
export async function ordemFundadorPagante(supabase: SupabaseClient, lojaId: string): Promise<number | null> {
  const { data, error } = await supabase
    .from('fundadores').select('ordem').eq('loja_id', lojaId).gte('ordem', 1).lte('ordem', 3).maybeSingle()
  if (error || !data) return null
  return (data as { ordem: number }).ordem
}
