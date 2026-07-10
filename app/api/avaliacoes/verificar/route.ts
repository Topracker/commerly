// #7 Verificação da cadeia de avaliações.
//
// Recalcula o HMAC de cada elo e devolve quantas conferem, quantas são legado
// (anteriores à feature, sem hash) e quais estão inválidas. Qualquer um pode
// chamar — é justamente essa auditabilidade que dá sentido ao selo.
//
// Roda sobre a tabela crua (não a view `*_atuais`): avaliações substituídas
// continuam na cadeia e precisam ser reprocessadas na ordem.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '../../../lib/supabase-admin'
import { rateLimit } from '../../../lib/rate-limit'
import { ipDaRequisicao } from '../../../lib/rotaSupabase'
import { verificarCadeia, type EloCadeia } from '../../../lib/integridade'

export const runtime = 'nodejs'

const TABELAS: Record<string, { tabela: string; coluna: string }> = {
  loja: { tabela: 'avaliacoes_lojas', coluna: 'loja_id' },
  entregador: { tabela: 'avaliacoes_entregadores', coluna: 'entregador_id' },
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const alvo = searchParams.get('alvo') ?? 'loja'
  const cfg = TABELAS[alvo]
  if (!cfg) return NextResponse.json({ erro: 'Alvo inválido.' }, { status: 400 })

  if (!rateLimit(`verificar-ip:${ipDaRequisicao(request)}`, 30, 60 * 60_000)) {
    return NextResponse.json({ erro: 'Muitas verificações seguidas.' }, { status: 429 })
  }

  if (!process.env.AVALIACOES_HMAC_SECRET) {
    return NextResponse.json({ erro: 'Verificação indisponível.' }, { status: 500 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from(cfg.tabela)
    .select(`id, seq, cliente_id, ${cfg.coluna}, nota, comentario, created_at, hash, hash_anterior`)
    .order('seq', { ascending: true })

  if (error) {
    console.error('[avaliacoes/verificar] leitura falhou:', error.message)
    return NextResponse.json({ erro: 'Falha ao verificar.' }, { status: 500 })
  }

  const elos: EloCadeia[] = (data ?? []).map((r: Record<string, any>) => ({
    id: r.id,
    seq: r.seq,
    cliente_id: r.cliente_id,
    alvo_id: r[cfg.coluna],
    nota: r.nota,
    comentario: r.comentario,
    created_at: r.created_at,
    hash: r.hash,
    hash_anterior: r.hash_anterior,
  }))

  const resultado = verificarCadeia(elos)

  return NextResponse.json({
    ...resultado,
    integra: resultado.invalidas.length === 0,
    // Não prometemos imutabilidade — dizemos exatamente o que o selo cobre.
    escopo: 'Cada avaliação é assinada pelo servidor e encadeada à anterior. Alterar ou remover uma avaliação invalida a cadeia a partir dela.',
  })
}
