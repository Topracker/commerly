import { NextRequest, NextResponse } from 'next/server'
import { autenticarCliente } from '../_lib'
import type { CupomDoCliente, CupomPrevia } from '../../../lib/cupons'

// Cupons do cliente logado que ainda valem, com a PRÉVIA do rateio numa festa.
//
//   GET /api/festa/cupons?festa_id=<uuid>
//
// A prévia vem de `festa_cupom_previa` (banco): quais lojas aceitam, quanto o
// cliente vai ganhar e se é menos que o cupom cheio (loja que não aceita fica
// fora do rateio). É só informativa — o valor real sai de `aplicar_cupom_festa`
// no fechamento, sobre o total autoritativo dos pedidos.
export async function GET(request: NextRequest) {
  const auth = await autenticarCliente()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { admin, cliente } = auth.ctx

  const festaId = new URL(request.url).searchParams.get('festa_id')

  const { data: cupons, error } = await admin
    .from('cupons')
    .select('id, codigo, loja_id, tipo, valor, minimo, origem, expira_em, usado_em, festa_id, desconto_aplicado')
    .eq('cliente_id', cliente.id)
    .is('usado_em', null)
    .or('expira_em.is.null,expira_em.gt.' + new Date().toISOString())
    .order('expira_em', { ascending: true, nullsFirst: false })
  if (error) {
    console.error('[festa/cupons] erro ao listar:', error.message)
    return NextResponse.json({ error: 'Não foi possível carregar seus cupons.' }, { status: 500 })
  }

  const lista: CupomDoCliente[] = []
  for (const c of cupons || []) {
    let previa: CupomPrevia | null = null
    if (festaId) {
      const { data, error: pe } = await admin.rpc('festa_cupom_previa', {
        p_festa_id: festaId, p_cupom_id: c.id, p_cliente_id: cliente.id,
      })
      // Cupom de outro dono / festa de outro criador: a função levanta erro —
      // o cupom simplesmente não aparece como aplicável.
      previa = pe ? { ok: false, motivo: limparErro(pe.message), desconto_total: 0, lojas_ignoradas: [], participantes: [] } : (data as CupomPrevia)
    }
    lista.push({
      id: c.id, codigo: c.codigo, loja_id: c.loja_id, tipo: c.tipo, valor: Number(c.valor), minimo: Number(c.minimo),
      expira_em: c.expira_em, usado_em: c.usado_em, origem: c.origem, festa_id: c.festa_id,
      desconto_aplicado: c.desconto_aplicado == null ? null : Number(c.desconto_aplicado),
      previa,
    })
  }

  return NextResponse.json({ cupons: lista })
}

function limparErro(msg: string): string {
  return msg.replace(/^.*P0001[^:]*:?\s*/, '').trim() || 'Este cupom não vale nesta festa.'
}
