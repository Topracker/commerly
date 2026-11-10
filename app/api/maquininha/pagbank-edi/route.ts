import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '../../../lib/supabase-admin'
import { rateLimit } from '../../../lib/rate-limit'
import { cifraDisponivel, cifrarToken, finalDoToken } from '../../../lib/pagbankEdiCripto'
import { lojaDaSessao } from './sessao'

// Cadastro da maquininha PagBank automática (Extrato EDI).
// POST salva número do estabelecimento + token (cifrado); DELETE remove.
// O token NUNCA volta para a tela: a leitura (RLS, só o dono) devolve só o final.
// Separado da integração PagBank "Em breve" (lib/pagbankStatus.ts): não a religa.

const indisponivel = () => NextResponse.json(
  { erro: 'A conexão automática com o PagBank está sendo ativada. Tente de novo em alguns minutos.' },
  { status: 503 },
)

export async function POST(request: NextRequest) {
  const sessao = await lojaDaSessao()
  if (!sessao) return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 })
  if (!rateLimit(`pagbank-edi-salvar:${sessao.userId}`, 10, 60_000)) {
    return NextResponse.json({ erro: 'Muitas tentativas seguidas. Espere um minuto.' }, { status: 429 })
  }
  if (!cifraDisponivel()) return indisponivel()

  const body = await request.json().catch(() => null) as { estabelecimento?: unknown; token?: unknown } | null
  const estabelecimento = String(body?.estabelecimento ?? '').replace(/\D/g, '')
  const token = String(body?.token ?? '').trim()
  if (!/^\d{3,20}$/.test(estabelecimento)) {
    return NextResponse.json({ erro: 'Digite o número do estabelecimento (só números).' }, { status: 400 })
  }
  if (token && (token.length < 8 || token.length > 512 || /\s/.test(token))) {
    return NextResponse.json({ erro: 'Esse token EDI não parece válido. Copie de novo do e-mail do PagBank.' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { lojaId } = sessao
  const { data: atual, error: erroAtual } = await admin.from('pagbank_edi_conexoes')
    .select('estabelecimento').eq('loja_id', lojaId).maybeSingle()
  if (erroAtual) {
    if (erroAtual.code === '42P01' || erroAtual.code === 'PGRST205') return indisponivel()
    return NextResponse.json({ erro: 'Não foi possível salvar agora.' }, { status: 500 })
  }
  if (!atual && !token) return NextResponse.json({ erro: 'Cole o token EDI.' }, { status: 400 })

  const agora = new Date().toISOString()
  const trocouConta = !atual || atual.estabelecimento !== estabelecimento
  const linha: Record<string, unknown> = { loja_id: lojaId, estabelecimento, atualizado_em: agora }
  if (token) linha.token_final = finalDoToken(token)
  // Conta nova ou token novo: recomeça do zero (status e janela de dias).
  if (trocouConta || token) Object.assign(linha, { status: 'nova', ultimo_erro: null })
  if (trocouConta) linha.ultimo_dia_validado = null

  const { data: gravada, error } = await admin.from('pagbank_edi_conexoes')
    .upsert(linha, { onConflict: 'loja_id' }).select('loja_id')
  if (error || !gravada?.length) {
    console.error('[pagbank-edi] erro ao salvar conexão:', error?.code, error?.message)
    return NextResponse.json({ erro: 'Não foi possível salvar agora.' }, { status: 500 })
  }
  if (token) {
    const { data: seg, error: erroSeg } = await admin.from('pagbank_edi_segredos')
      .upsert({ loja_id: lojaId, token_cifrado: cifrarToken(token, lojaId), atualizado_em: agora }, { onConflict: 'loja_id' })
      .select('loja_id')
    if (erroSeg || !seg?.length) {
      console.error('[pagbank-edi] erro ao salvar segredo:', erroSeg?.code)
      return NextResponse.json({ erro: 'Não foi possível salvar o token agora.' }, { status: 500 })
    }
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE() {
  const sessao = await lojaDaSessao()
  if (!sessao) return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 })
  const admin = createAdminClient()
  // O segredo sai junto (on delete cascade). As vendas já gravadas ficam.
  const { error } = await admin.from('pagbank_edi_conexoes').delete().eq('loja_id', sessao.lojaId)
  if (error) return NextResponse.json({ erro: 'Não foi possível remover agora.' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
