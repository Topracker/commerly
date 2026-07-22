import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import Stripe from 'stripe'
import { rateLimit } from '../../../lib/rate-limit'
import { createAdminClient } from '../../../lib/supabase-admin'
import { descontoMensalidade } from '../../../lib/gamificacaoServer'
import { descontoDoIndicador } from '../../../lib/indicacaoDesconto'
import { aplicarDescontoAssinatura } from '../../../lib/stripeMensalidade'

// Aplica, na próxima cobrança do comerciante, o MELHOR desconto entre:
//  - faixa por faturamento do mês (fidelidade)
//  - nível do comerciante (Prata 10% / Ouro 20% / Diamante 30%)
//  - indicações confirmadas (10% cada, até 40% — lib/precos.ts)
// Idempotente: nunca reduz o desconto já aplicado.
//
// O desconto de indicação é `forever` (vale enquanto durar a assinatura); os
// outros dois são `once`, porque dependem do mês. Quando a indicação é a que
// vence, é ela que fica valendo — e é também a rede de segurança para quando o
// webhook não conseguiu aplicar o cupom na hora.

const FAIXAS = [
  { meta: 10000, pct: 15 },
  { meta: 5000, pct: 10 },
]

export async function POST(request: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } },
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (!rateLimit(`stripe-desconto:${user.id}`, 20, 60_000)) return NextResponse.json({ ok: true, aplicado: false })
  if (!process.env.STRIPE_SECRET_KEY) return NextResponse.json({ ok: true, aplicado: false })

  const { data: loja } = await supabase
    .from('lojas').select('id, plano, stripe_subscription_id').eq('user_id', user.id).single()
  if (!loja?.stripe_subscription_id || loja.plano !== 'ativo') {
    return NextResponse.json({ ok: true, aplicado: false })
  }

  // Faturamento do mês (fidelidade) + total de pedidos (nível).
  const agora = new Date()
  const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1)
  const [{ data: vendas }, { data: pedidos }, { count: pedidosTotal }] = await Promise.all([
    supabase.from('vendas').select('valor_total').eq('loja_id', loja.id).gte('created_at', inicioMes.toISOString()),
    supabase.from('pedidos_clientes').select('total').eq('loja_id', loja.id).neq('status', 'cancelado').gte('created_at', inicioMes.toISOString()),
    supabase.from('pedidos_clientes').select('id', { count: 'exact', head: true }).eq('loja_id', loja.id).neq('status', 'cancelado'),
  ])

  const faturamento =
    (vendas || []).reduce((a, v: any) => a + (v.valor_total || 0), 0) +
    (pedidos || []).reduce((a, p: any) => a + (Number(p.total) || 0), 0)
  const faixaPct = FAIXAS.find(f => faturamento >= f.meta)?.pct ?? 0
  const nivelPct = descontoMensalidade(pedidosTotal || 0)
  const { confirmadas, pct: indicacaoPct } = await descontoDoIndicador(createAdminClient(), user.id)
  const melhorPct = Math.max(faixaPct, nivelPct, indicacaoPct)
  const duracao = indicacaoPct > 0 && indicacaoPct >= Math.max(faixaPct, nivelPct) ? 'forever' : 'once'

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

  try {
    const { aplicado } = await aplicarDescontoAssinatura(stripe, loja.stripe_subscription_id, melhorPct, duracao)
    return NextResponse.json({ ok: true, aplicado, pct: melhorPct, faturamento, nivelPct, indicacaoPct, confirmadas })
  } catch (e) {
    console.error('[stripe/aplicar-desconto] erro:', e)
    return NextResponse.json({ ok: true, aplicado: false }, { status: 502 })
  }
}
