import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '../../../lib/supabase-admin'
import { rateLimit } from '../../../lib/rate-limit'

// Fallback de sincronização: quando o webhook do MP não chega (config do
// painel, etc.), o lojista clica em "Sincronizar pagamentos" e buscamos os
// pagamentos aprovados recentes direto na API do MP, gravando os que ainda
// não estão em `vendas`. Mesma forma de inserção do webhook.

const JANELA = 'NOW-30DAYS' // busca os aprovados dos últimos 30 dias
const LIMITE = 50

export async function POST(req: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 })

  if (!rateLimit(`mp-sync:${user.id}`, 10, 60_000)) {
    return NextResponse.json({ erro: 'Muitas sincronizações seguidas. Aguarde um momento.' }, { status: 429 })
  }

  // Confirma a loja do usuário logado.
  const { data: loja } = await supabase
    .from('lojas')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!loja) return NextResponse.json({ erro: 'Loja não encontrada.' }, { status: 404 })

  const admin = createAdminClient()

  const { data: conexoes, error: cErr } = await admin
    .from('mercadopago_conexoes')
    .select('access_token, updated_at')
    .eq('loja_id', loja.id)
    .order('updated_at', { ascending: false })

  if (cErr) {
    console.error('[MP sync] erro ao buscar conexão:', cErr)
    return NextResponse.json({ erro: 'Erro ao buscar a conexão do Mercado Pago.' }, { status: 500 })
  }
  if (!conexoes || conexoes.length === 0) {
    return NextResponse.json({ erro: 'Mercado Pago não está conectado nesta loja.' }, { status: 400 })
  }

  const accessToken = conexoes[0].access_token

  // Busca pagamentos aprovados recentes na conta do lojista.
  const params = new URLSearchParams({
    sort: 'date_created',
    criteria: 'desc',
    range: 'date_created',
    begin_date: JANELA,
    end_date: 'NOW',
    status: 'approved',
    limit: String(LIMITE),
  })
  const busca = await fetch(`https://api.mercadopago.com/v1/payments/search?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!busca.ok) {
    const corpo = await busca.text().catch(() => '')
    if (busca.status === 401) {
      return NextResponse.json(
        { erro: 'O token do Mercado Pago expirou. Reconecte a conta em Integrações.' },
        { status: 401 }
      )
    }
    console.error('[MP sync] erro na busca de pagamentos:', busca.status, corpo.slice(0, 200))
    return NextResponse.json({ erro: 'Não foi possível consultar o Mercado Pago agora.' }, { status: 502 })
  }

  const dados = await busca.json()
  const resultados: any[] = Array.isArray(dados?.results) ? dados.results : []
  const aprovados = resultados.filter(p => p?.status === 'approved' && p?.id != null)

  if (aprovados.length === 0) return NextResponse.json({ ok: true, novas: 0, encontrados: 0 })

  // Remove os que já estão gravados (por mp_payment_id).
  const ids = aprovados.map(p => String(p.id))
  const { data: existentes } = await admin
    .from('vendas')
    .select('mp_payment_id')
    .eq('loja_id', loja.id)
    .in('mp_payment_id', ids)
  const jaGravados = new Set((existentes ?? []).map(v => String(v.mp_payment_id)))

  const novas = aprovados.filter(p => !jaGravados.has(String(p.id)))
  if (novas.length === 0) return NextResponse.json({ ok: true, novas: 0, encontrados: aprovados.length })

  const linhas = novas.map(p => {
    const forma = resolverFormaPagamento(p.payment_type_id)
    return {
      loja_id: loja.id,
      produto_id: null,
      descricao: forma,
      quantidade: 1,
      valor_total: p.transaction_amount,
      lucro: 0,
      forma_pagamento: forma,
      origem: 'mercadopago',
      mp_payment_id: String(p.id),
    }
  })

  const { error: insErr } = await admin.from('vendas').insert(linhas)
  if (insErr) {
    console.error('[MP sync] erro ao gravar vendas:', insErr)
    return NextResponse.json({ erro: 'Erro ao gravar as vendas sincronizadas.' }, { status: 500 })
  }

  console.log('[MP sync] loja', loja.id, '— gravadas', linhas.length, 'de', aprovados.length, 'aprovados')
  return NextResponse.json({ ok: true, novas: linhas.length, encontrados: aprovados.length })
}

function resolverFormaPagamento(type: string): string {
  switch (type) {
    case 'credit_card': return 'Cartão de crédito'
    case 'debit_card': return 'Cartão de débito'
    case 'bank_transfer': return 'Pix'
    case 'account_money': return 'Carteira MP'
    case 'ticket': return 'Boleto'
    default: return 'Maquininha'
  }
}
