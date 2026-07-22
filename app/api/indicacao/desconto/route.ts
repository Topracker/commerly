import { NextResponse } from 'next/server'
import { createAdminClient } from '../../../lib/supabase-admin'
import { supabaseDaRota, usuarioDaRota } from '../../../lib/rotaSupabase'
import { descontoDoIndicador } from '../../../lib/indicacaoDesconto'
import { precoBase, precoComDesconto, pctIndicacoes } from '../../../lib/precos'

export const runtime = 'nodejs'

// Situação do desconto por indicação do comerciante logado: quantas indicações
// já assinaram, o percentual atual e quanto fica (e ficaria) a mensalidade.
export async function GET() {
  const supabase = await supabaseDaRota()
  const user = await usuarioDaRota(supabase)
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const admin = createAdminClient()
  const [{ confirmadas, pct }, { data: loja }] = await Promise.all([
    descontoDoIndicador(admin, user.id),
    admin.from('lojas').select('fundador').eq('user_id', user.id).maybeSingle(),
  ])

  // Quantas indicações faltam para a próxima faixa (null quando está no teto).
  const proximaPct = pctIndicacoes(confirmadas + 1)
  const base = precoBase(loja?.fundador)

  return NextResponse.json({
    confirmadas,
    pct,
    fundador: !!loja?.fundador,
    precoBase: base,
    preco: precoComDesconto(base, pct),
    proxima: proximaPct > pct ? { pct: proximaPct, preco: precoComDesconto(base, proximaPct) } : null,
  })
}
