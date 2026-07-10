import { NextResponse } from 'next/server'
import { autenticarCliente } from '../_lib'

// Lista as festas em que o cliente participa (criadas por ele ou por convite),
// mais recentes primeiro. Usado no hub /cliente/festa.
export async function GET() {
  const auth = await autenticarCliente()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { admin, cliente } = auth.ctx

  const { data: parts } = await admin
    .from('festa_participantes').select('festa_id, itens, pedido_id').eq('cliente_id', cliente.id)
  const ids = (parts || []).map((p: any) => p.festa_id)
  if (ids.length === 0) return NextResponse.json({ festas: [] })

  const meusItens = new Map((parts || []).map((p: any) => [p.festa_id, Array.isArray(p.itens) ? p.itens.length : 0]))

  const { data: festas } = await admin
    .from('festas').select('id, nome, codigo, status, criador_cliente_id, taxa_por_pessoa, created_at, expira_em')
    .in('id', ids).order('created_at', { ascending: false })

  // Nº de participantes por festa.
  const { data: todosParts } = await admin
    .from('festa_participantes').select('festa_id').in('festa_id', ids)
  const contagem = new Map<string, number>()
  for (const p of todosParts || []) contagem.set(p.festa_id, (contagem.get(p.festa_id) || 0) + 1)

  return NextResponse.json({
    festas: (festas || []).map((f: any) => ({
      ...f,
      sou_criador: f.criador_cliente_id === cliente.id,
      meus_itens: meusItens.get(f.id) || 0,
      participantes: contagem.get(f.id) || 0,
    })),
  })
}
