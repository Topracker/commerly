import type { createAdminClient } from './supabase-admin'

// Lógica de sincronização de pagamentos do Mercado Pago, compartilhada entre a
// rota manual (/api/mercadopago/sincronizar) e o cron automático
// (/api/mercadopago/sincronizar-cron). Busca os pagamentos aprovados recentes
// de uma conta e grava em `vendas` os que ainda não existem.

type Admin = ReturnType<typeof createAdminClient>

const JANELA = 'NOW-30DAYS' // pagamentos aprovados dos últimos 30 dias
const LIMITE = 50

export type ResultadoSync = {
  ok: boolean
  novas: number
  encontrados: number
  status?: number
  erro?: 'token_expirado' | 'busca_falhou' | 'insert_falhou'
}

export function resolverFormaPagamento(type: string): string {
  switch (type) {
    case 'credit_card': return 'Cartão de crédito'
    case 'debit_card': return 'Cartão de débito'
    case 'bank_transfer': return 'Pix'
    case 'account_money': return 'Carteira MP'
    case 'ticket': return 'Boleto'
    default: return 'Maquininha'
  }
}

export async function sincronizarLojaMP(
  admin: Admin,
  lojaId: string,
  accessToken: string,
): Promise<ResultadoSync> {
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
    if (busca.status !== 401) {
      console.error('[MP sync] busca falhou para loja', lojaId, busca.status, corpo.slice(0, 200))
    }
    return {
      ok: false,
      novas: 0,
      encontrados: 0,
      status: busca.status,
      erro: busca.status === 401 ? 'token_expirado' : 'busca_falhou',
    }
  }

  const dados = await busca.json()
  const resultados: any[] = Array.isArray(dados?.results) ? dados.results : []
  const aprovados = resultados.filter(p => p?.status === 'approved' && p?.id != null)
  if (aprovados.length === 0) return { ok: true, novas: 0, encontrados: 0 }

  // Dedup GLOBAL por mp_payment_id (igual ao webhook): um pagamento só é
  // gravado uma vez, mesmo que a conta esteja ligada a mais de uma loja.
  const ids = aprovados.map(p => String(p.id))
  const { data: existentes } = await admin
    .from('vendas')
    .select('mp_payment_id')
    .in('mp_payment_id', ids)
  const jaGravados = new Set((existentes ?? []).map(v => String(v.mp_payment_id)))

  const novas = aprovados.filter(p => !jaGravados.has(String(p.id)))
  if (novas.length === 0) return { ok: true, novas: 0, encontrados: aprovados.length }

  const linhas = novas.map(p => {
    const forma = resolverFormaPagamento(p.payment_type_id)
    return {
      loja_id: lojaId,
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

  const { error } = await admin.from('vendas').insert(linhas)
  if (error) {
    console.error('[MP sync] erro ao gravar vendas para loja', lojaId, error.message)
    return { ok: false, novas: 0, encontrados: aprovados.length, erro: 'insert_falhou' }
  }

  return { ok: true, novas: linhas.length, encontrados: aprovados.length }
}
