import type { createAdminClient } from './supabase-admin'

// Lógica de sincronização de pagamentos do Mercado Pago, compartilhada entre a
// rota manual (/api/mercadopago/sincronizar) e o cron automático
// (/api/mercadopago/sincronizar-cron). Busca os pagamentos aprovados recentes
// de uma conta e grava em `vendas` os que ainda não existem.

type Admin = ReturnType<typeof createAdminClient>

const JANELA = 'NOW-30DAYS' // pagamentos aprovados dos últimos 30 dias
const LIMITE = 50
const MAX_PAGINAS = 10

export type ResultadoSync = {
  ok: boolean
  novas: number
  encontrados: number
  status?: number
  erro?: 'token_expirado' | 'busca_falhou' | 'insert_falhou'
}

/** Campos usados de um pagamento de /v1/payments. Todos podem faltar na resposta. */
export type PagamentoMP = {
  id?: string | number
  status?: string
  operation_type?: string
  payment_type_id?: string
  payment_method_id?: string
  transaction_amount?: number
  date_approved?: string | null
  point_of_interaction?: { type?: string } | null
  transaction_details?: { net_received_amount?: number | null } | null
  fee_details?: { fee_payer?: string; amount?: number }[] | null
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

/**
 * O pagamento veio da maquininha Point? A doc do MP lista `operation_type:
 * pos_payment`; `point_of_interaction` é a segunda pista. NÃO confirmado com
 * pagamento real: em 2026-11-06 nenhuma conta estava conectada. Um pagamento
 * que não casar continua entrando, só que como origem 'mercadopago'.
 */
export function ehPagamentoPoint(p: PagamentoMP): boolean {
  if (p?.operation_type === 'pos_payment') return true
  return /point/i.test(String(p?.point_of_interaction?.type ?? ''))
}

/** Taxa cobrada do lojista: soma de `fee_details`, ou bruto − líquido. */
export function taxaDoPagamento(p: PagamentoMP): number | null {
  const fees = Array.isArray(p?.fee_details) ? p.fee_details : []
  const doLojista = fees.filter(f => f?.fee_payer === 'collector' && Number.isFinite(Number(f?.amount)))
  if (doLojista.length > 0) {
    return Math.round(doLojista.reduce((s, f) => s + Number(f.amount), 0) * 100) / 100
  }
  const liquido = Number(p?.transaction_details?.net_received_amount)
  const bruto = Number(p?.transaction_amount)
  if (p?.transaction_details?.net_received_amount == null || !Number.isFinite(liquido) || !Number.isFinite(bruto)) return null
  return Math.round((bruto - liquido) * 100) / 100
}

/** Linha de `vendas` de um pagamento aprovado — a mesma no sync e no webhook. */
export function linhaVendaMP(p: PagamentoMP, lojaId: string) {
  const forma = resolverFormaPagamento(p.payment_type_id ?? '')
  const base = {
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
  if (!ehPagamentoPoint(p)) return base

  const taxa = taxaDoPagamento(p)
  const liquidoInformado = p?.transaction_details?.net_received_amount
  const cartao = p.payment_type_id === 'credit_card' || p.payment_type_id === 'debit_card'
  return {
    ...base,
    descricao: `Maquininha Mercado Pago · ${forma}`,
    origem: 'maquininha_mp',
    adquirente: 'mercadopago',
    id_externo: String(p.id),
    taxa,
    valor_liquido: liquidoInformado != null
      ? Number(liquidoInformado)
      : taxa != null ? Math.round((Number(p.transaction_amount) - taxa) * 100) / 100 : null,
    bandeira: cartao && p.payment_method_id ? String(p.payment_method_id) : null,
    // A data é a da venda, não a do sync: `created_at` é timestamp sem fuso em UTC.
    ...(p.date_approved ? { created_at: new Date(p.date_approved).toISOString() } : {}),
  }
}

export async function sincronizarLojaMP(
  admin: Admin,
  lojaId: string,
  accessToken: string,
): Promise<ResultadoSync> {
  // O MP devolve no máximo 50 por página. Uma loja com maquininha passa disso
  // fácil em 30 dias, e sem paginar as vendas mais antigas nunca entrariam.
  const resultados: PagamentoMP[] = []
  for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
    const params = new URLSearchParams({
      sort: 'date_created',
      criteria: 'desc',
      range: 'date_created',
      begin_date: JANELA,
      end_date: 'NOW',
      status: 'approved',
      limit: String(LIMITE),
      offset: String(pagina * LIMITE),
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
    const pag: PagamentoMP[] = Array.isArray(dados?.results) ? dados.results : []
    resultados.push(...pag)
    if (pag.length < LIMITE) break
  }

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

  // A venda também pode já estar aqui por ter vindo no extrato importado.
  const { data: importadas, error: erroImportadas } = await admin
    .from('vendas')
    .select('id_externo')
    .eq('loja_id', lojaId)
    .eq('adquirente', 'mercadopago')
    .in('id_externo', ids)
  if (erroImportadas) {
    console.error('[MP sync] erro ao conferir vendas importadas da loja', lojaId, erroImportadas.message)
    return { ok: false, novas: 0, encontrados: aprovados.length, erro: 'insert_falhou' }
  }
  for (const v of importadas ?? []) jaGravados.add(String(v.id_externo))

  const novas = aprovados.filter(p => !jaGravados.has(String(p.id)))
  if (novas.length === 0) return { ok: true, novas: 0, encontrados: aprovados.length }

  const linhas = novas.map(p => linhaVendaMP(p, lojaId))

  const { error } = await admin.from('vendas').insert(linhas)
  if (error) {
    console.error('[MP sync] erro ao gravar vendas para loja', lojaId, error.message)
    return { ok: false, novas: 0, encontrados: aprovados.length, erro: 'insert_falhou' }
  }

  return { ok: true, novas: linhas.length, encontrados: aprovados.length }
}
