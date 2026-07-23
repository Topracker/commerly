import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '../../../lib/supabase-admin'
import { sincronizarLojaMP } from '../../../lib/mercadopago-sync'
import { integracoesAtivas } from '../../../lib/plano'

// Cron automático (Vercel Cron, a cada 5 min — ver vercel.json). Sincroniza os
// pagamentos do Mercado Pago de TODAS as lojas conectadas, gravando as vendas
// novas. Funciona como rede de segurança caso o webhook não chegue.

export const dynamic = 'force-dynamic'
export const maxDuration = 60

type Conexao = { loja_id: string; access_token: string; mp_user_id: string; updated_at: string | null }

export async function GET(req: NextRequest) {
  // Fail-closed: o Vercel Cron (e o GitHub Action de 5 min) enviam "Authorization:
  // Bearer <CRON_SECRET>". Sem a env var configurada, ou com header errado, o
  // endpoint recusa — não fica aberto para qualquer um disparar a sincronização.
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 })
  }

  const admin = createAdminClient()

  const { data: conexoes, error } = await admin
    .from('mercadopago_conexoes')
    .select('loja_id, access_token, mp_user_id, updated_at')
    .order('updated_at', { ascending: false })

  if (error) {
    console.error('[MP cron] erro ao listar conexões:', error.message)
    return NextResponse.json({ erro: 'Erro ao listar conexões.' }, { status: 500 })
  }

  // Uma conta MP (mp_user_id) pode estar ligada a mais de uma loja. Pra não
  // gravar a mesma venda em duas lojas, sincronizamos cada conta UMA vez, na
  // conexão mais recente (a lista já vem ordenada por updated_at desc).
  const porConta = new Map<string, Conexao>()
  for (const c of (conexoes ?? []) as Conexao[]) {
    const chave = String(c.mp_user_id)
    if (!porConta.has(chave)) porConta.set(chave, c)
  }

  let totalNovas = 0
  let comErro = 0
  let pausadas = 0
  const tokensExpirados: string[] = []

  for (const c of porConta.values()) {
    // PAYWALL: loja fora do plano fica com a integração pausada. Nada é
    // desconectado — assim que ela regularizar, a próxima passada sincroniza
    // tudo que ficou para trás (a busca é por período, não incremental).
    if (!(await integracoesAtivas(admin, c.loja_id))) { pausadas++; continue }

    const r = await sincronizarLojaMP(admin, c.loja_id, c.access_token)
    if (r.ok) {
      totalNovas += r.novas
    } else {
      comErro++
      if (r.erro === 'token_expirado') tokensExpirados.push(c.loja_id)
    }
  }

  console.log('[MP cron] contas:', porConta.size, 'novas:', totalNovas, 'erros:', comErro,
    'pausadas (plano inativo):', pausadas,
    tokensExpirados.length ? `tokens expirados (lojas): ${tokensExpirados.join(', ')}` : '')

  return NextResponse.json({
    ok: true,
    contas: porConta.size,
    novas: totalNovas,
    erros: comErro,
    pausadas,
    tokensExpirados,
  })
}
