import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '../../lib/supabase-admin'
import { supabaseDaRota, usuarioDaRota } from '../../lib/rotaSupabase'
import { descontoKit } from '../../lib/gamificacaoServer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Kit oficial do entregador — pedido e rastreio.
//
//   GET  -> o kit do entregador logado (ou null)
//   POST -> abre um pedido de kit (status inicial aguardando_pagamento)
//
// O AVANÇO de status NÃO mora aqui: quem empurra é a operação, pela rota de
// admin. Se o próprio entregador pudesse avançar, ele marcaria "ativado"
// sozinho e o kit deixaria de ser o que ativa a conta.

const PRECO_BASE = 149.9

async function entregadorDoUsuario(admin: any, userId: string) {
  const { data } = await admin.from('entregadores').select('id, nome').eq('user_id', userId).maybeSingle()
  return data as { id: string; nome: string } | null
}

export async function GET() {
  const supabase = await supabaseDaRota()
  const user = await usuarioDaRota(supabase)
  if (!user) return NextResponse.json({ kit: null, autenticado: false })

  const admin = createAdminClient()
  const ent = await entregadorDoUsuario(admin, user.id)
  if (!ent) return NextResponse.json({ kit: null, autenticado: true, entregador: false })

  const { data: kit } = await admin
    .from('kit_pedidos')
    .select('id, status, codigo_rastreio, valor, historico, created_at, updated_at')
    .eq('entregador_id', ent.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // Desconto por nível: quanto mais entregas, mais barato o kit.
  const { count } = await admin.from('pedidos_clientes')
    .select('id', { count: 'exact', head: true })
    .eq('entregador_id', ent.id).eq('status', 'entregue')
  const pct = descontoKit(count || 0)

  return NextResponse.json({
    kit: kit || null,
    autenticado: true,
    entregador: true,
    nome: ent.nome,
    preco: { base: PRECO_BASE, descontoPct: pct, final: Number((PRECO_BASE * (1 - pct / 100)).toFixed(2)) },
  })
}

export async function POST(request: NextRequest) {
  const supabase = await supabaseDaRota()
  const user = await usuarioDaRota(supabase)
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const admin = createAdminClient()
  const ent = await entregadorDoUsuario(admin, user.id)
  if (!ent) return NextResponse.json({ error: 'Só entregadores pedem o kit.' }, { status: 403 })

  // Um kit vivo por vez — pedir de novo enquanto o primeiro anda geraria dois
  // rastreios para a mesma pessoa e a tela não saberia qual mostrar.
  const { data: existente } = await admin
    .from('kit_pedidos').select('id, status').eq('entregador_id', ent.id)
    .not('status', 'in', '("cancelado")')
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (existente) return NextResponse.json({ kit: existente, jaExiste: true })

  const { count } = await admin.from('pedidos_clientes')
    .select('id', { count: 'exact', head: true })
    .eq('entregador_id', ent.id).eq('status', 'entregue')
  const valor = Number((PRECO_BASE * (1 - descontoKit(count || 0) / 100)).toFixed(2))

  const { data: kit, error } = await admin
    .from('kit_pedidos')
    .insert({ entregador_id: ent.id, status: 'aguardando_pagamento', valor })
    .select('id, status, valor, historico, created_at')
    .single()

  if (error) {
    console.error('[kit] erro ao criar pedido:', error.message)
    return NextResponse.json({ error: 'Não foi possível abrir o pedido do kit.' }, { status: 500 })
  }
  return NextResponse.json({ kit })
}
