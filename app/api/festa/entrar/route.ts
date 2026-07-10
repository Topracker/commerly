import { NextRequest, NextResponse } from 'next/server'
import { autenticarCliente, bodyDe } from '../_lib'
import { rateLimit } from '../../../lib/rate-limit'
import { normalizarCodigo } from '../../../lib/festas'

// Entra numa festa pelo código de convite. Idempotente: se já for participante,
// só devolve a festa. Só entra em festa ABERTA e não expirada.
export async function POST(request: NextRequest) {
  const auth = await autenticarCliente()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { admin, cliente } = auth.ctx

  if (!rateLimit(`festa-entrar:${cliente.id}`, 20, 60_000)) {
    return NextResponse.json({ error: 'Muitas tentativas. Aguarde um instante.' }, { status: 429 })
  }

  const codigo = normalizarCodigo(String((await bodyDe(request))?.codigo || ''))
  if (codigo.length < 4) return NextResponse.json({ error: 'Código inválido.' }, { status: 400 })

  const { data: festa } = await admin
    .from('festas').select('id, status, expira_em, nome').eq('codigo', codigo).maybeSingle()
  if (!festa) return NextResponse.json({ error: 'Festa não encontrada. Confira o código.' }, { status: 404 })
  if (festa.status !== 'aberta') {
    return NextResponse.json({ error: 'Esta festa já foi fechada.' }, { status: 409 })
  }
  if (new Date(festa.expira_em).getTime() <= Date.now()) {
    return NextResponse.json({ error: 'Esta festa expirou.' }, { status: 409 })
  }

  const { error } = await admin
    .from('festa_participantes').insert({ festa_id: festa.id, cliente_id: cliente.id })
  // 23505 = já é participante -> ok, idempotente.
  if (error && error.code !== '23505') {
    console.error('[festa/entrar] erro:', error.message)
    return NextResponse.json({ error: 'Não foi possível entrar na festa.' }, { status: 500 })
  }

  return NextResponse.json({ festa: { id: festa.id, nome: festa.nome } })
}
