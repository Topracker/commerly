import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { exigirAdminAuditado } from '../../../lib/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ============================================================================
// FATURAMENTO AO VIVO (Stripe) — rota SEPARADA de propósito
// ----------------------------------------------------------------------------
// Fica fora de `../dados` porque ali são 25+ consultas ao Postgres que
// respondem em milissegundos; aqui é rede externa. Junto, um dia ruim da Stripe
// deixaria o painel inteiro girando. Separado, a aba carrega sozinha e o resto
// do painel não sente.
//
// Esta rota é a AUTORIDADE do MRR. O `../dados` devolve um MRR *estimado* pela
// tabela de preços sobre quem tem plano='ativo' no banco; aqui está o que a
// Stripe efetivamente cobra. Quando os dois discordam, quem está certa é ela —
// e a divergência é justamente o que interessa ver.
//
// Não dependemos de `lojas.stripe_subscription_id` para somar: hoje a coluna
// está NULA em 100% das lojas, inclusive nas 2 com plano='ativo'. Listar as
// assinaturas direto na Stripe dá o número certo mesmo com o banco defasado.
// ============================================================================

/** Mensalidade e Ads convivem na mesma conta. Ads carrega metadata.tipo='ads'
 *  (ver api/ads/assinar); a mensalidade carrega só { loja_id }. Os Prices da
 *  mensalidade ainda têm lookup_key commerly_mensal_*, que serve de reforço. */
function classificar(sub: Stripe.Subscription): 'ads' | 'mensalidade' {
  if ((sub.metadata?.tipo || '').toLowerCase() === 'ads') return 'ads'
  const lookups = (sub.items?.data || [])
    .map(i => (i.price as any)?.lookup_key || '')
    .filter(Boolean) as string[]
  if (lookups.some(l => l.startsWith('commerly_mensal_'))) return 'mensalidade'
  return 'mensalidade'
}

/** Valor mensal de uma assinatura, em reais. Anual vira /12 para o MRR não
 *  pular de degrau num mês e sumir nos outros. */
function mensalEmReais(sub: Stripe.Subscription): number {
  let centavosMes = 0
  for (const item of sub.items?.data || []) {
    const price = item.price as any
    const valor = Number(price?.unit_amount || 0) * Number(item.quantity || 1)
    const intervalo = price?.recurring?.interval as string | undefined
    const contagem = Number(price?.recurring?.interval_count || 1) || 1
    if (intervalo === 'year') centavosMes += valor / (12 * contagem)
    else if (intervalo === 'week') centavosMes += (valor * 52) / (12 * contagem)
    else if (intervalo === 'day') centavosMes += (valor * 365) / (12 * contagem)
    else centavosMes += valor / contagem // month
  }
  return Math.round(centavosMes) / 100
}

export async function GET(request: NextRequest) {
  const ctx = await exigirAdminAuditado(request, 'faturamento')
  if (!ctx.ok) return new NextResponse(null, { status: 404 })

  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({
      disponivel: false,
      motivo: 'STRIPE_SECRET_KEY não configurada neste ambiente.',
    })
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

  try {
    const lista = await stripe.subscriptions.list({
      status: 'all',
      limit: 100,
      expand: ['data.items.data.price'],
    })

    const resumo = {
      mensalidade: { ativas: 0, mrr: 0, fundador: 0, normal: 0 },
      ads: { ativas: 0, mrr: 0 },
      trial: 0,
      inadimplentes: 0,   // past_due / unpaid / incomplete
      canceladas: 0,
      cancelaNoFim: 0,    // ativa, mas já pediu cancelamento
    }

    const assinaturas: any[] = []

    for (const sub of lista.data) {
      const tipo = classificar(sub)
      const mensal = mensalEmReais(sub)
      const vivo = sub.status === 'active' || sub.status === 'trialing'

      if (sub.status === 'trialing') resumo.trial++
      if (['past_due', 'unpaid', 'incomplete'].includes(sub.status)) resumo.inadimplentes++
      if (['canceled', 'incomplete_expired'].includes(sub.status)) resumo.canceladas++
      if (sub.status === 'active' && sub.cancel_at_period_end) resumo.cancelaNoFim++

      // MRR conta só assinatura que está de fato faturando. `trialing` ainda não
      // cobrou nada: entra na contagem de trial, não na receita.
      if (sub.status === 'active') {
        if (tipo === 'ads') { resumo.ads.ativas++; resumo.ads.mrr += mensal }
        else {
          resumo.mensalidade.ativas++
          resumo.mensalidade.mrr += mensal
          const lookup = (sub.items?.data?.[0]?.price as any)?.lookup_key || ''
          if (lookup.includes('fundador')) resumo.mensalidade.fundador++
          else resumo.mensalidade.normal++
        }
      }

      if (vivo || sub.status === 'past_due') {
        assinaturas.push({
          id: sub.id,
          tipo,
          status: sub.status,
          mensal,
          loja_id: sub.metadata?.loja_id || null,
          cancelaNoFim: !!sub.cancel_at_period_end,
          criada_em: sub.created * 1000,
        })
      }
    }

    resumo.mensalidade.mrr = Math.round(resumo.mensalidade.mrr * 100) / 100
    resumo.ads.mrr = Math.round(resumo.ads.mrr * 100) / 100
    const mrrTotal = Math.round((resumo.mensalidade.mrr + resumo.ads.mrr) * 100) / 100

    // Faturas recentes da plataforma (todas as assinaturas, não de uma loja).
    let faturas: any[] = []
    try {
      const inv = await stripe.invoices.list({ limit: 20 })
      faturas = inv.data.map(i => ({
        id: i.id,
        numero: i.number,
        criada_em: i.created * 1000,
        valor: (i.amount_paid ?? i.total ?? 0) / 100,
        status: i.status,
        link: i.hosted_invoice_url,
      }))
    } catch (e) {
      console.warn('[gestao/faturamento] invoices falhou:', e instanceof Error ? e.message : e)
    }

    // Saldo da plataforma (o que já é nosso e ainda não caiu na conta).
    let saldo: { disponivel: number; pendente: number } | null = null
    try {
      const b = await stripe.balance.retrieve()
      const soma = (arr: any[]) =>
        Math.round(arr.filter(x => x.currency === 'brl').reduce((s, x) => s + x.amount, 0)) / 100
      saldo = { disponivel: soma(b.available || []), pendente: soma(b.pending || []) }
    } catch (e) {
      console.warn('[gestao/faturamento] balance falhou:', e instanceof Error ? e.message : e)
    }

    return NextResponse.json({
      disponivel: true,
      mrrTotal,
      resumo,
      assinaturas,
      faturas,
      saldo,
      // A Stripe pagina em 100. Passando disso, o número exibido fica curto e é
      // melhor dizer do que mostrar um MRR silenciosamente errado.
      truncado: lista.has_more,
      lidoEm: Date.now(),
    })
  } catch (e) {
    console.error('[gestao/faturamento] Stripe falhou:', e)
    return NextResponse.json(
      { disponivel: false, motivo: 'Não foi possível consultar a Stripe agora.' },
      { status: 502 },
    )
  }
}
