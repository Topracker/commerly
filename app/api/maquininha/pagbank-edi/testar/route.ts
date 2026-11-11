import { NextResponse } from 'next/server'
import { createAdminClient } from '../../../../lib/supabase-admin'
import { rateLimit } from '../../../../lib/rate-limit'
import { buscarDiaEdi, hojeSP, somarDiasIso } from '../../../../lib/pagbankEdi'
import { credenciaisDaLoja, registrarSincronizacaoEdi } from '../../../../lib/pagbankEdiSync'
import { lojaDaSessao } from '../sessao'

// "Testar conexão": consulta o movimento de ontem (1 item) com o token SALVO.
// Não grava venda nenhuma.

export const dynamic = 'force-dynamic'

export async function POST() {
  const sessao = await lojaDaSessao()
  if (!sessao) return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 })
  if (!rateLimit(`pagbank-edi-testar:${sessao.userId}`, 5, 60_000)) {
    return NextResponse.json({ erro: 'Muitos testes seguidos. Espere um minuto.' }, { status: 429 })
  }

  const admin = createAdminClient()
  const cred = await credenciaisDaLoja(admin, sessao.lojaId)
  if (!cred) return NextResponse.json({ erro: 'Salve o número do estabelecimento e o token antes de testar.' }, { status: 400 })

  const dia = somarDiasIso(hojeSP(), -1)
  const r = await buscarDiaEdi(cred.estabelecimento, cred.token, dia, { soPrimeira: true })
  await registrarSincronizacaoEdi(admin, sessao.lojaId, 'teste', {
    dia, validado: r.ok ? r.validado : null, linhas: r.ok ? r.detalhes.length : 0, erro: r.ok ? undefined : r.mensagem,
  }, r.status)

  if (!r.ok) {
    if (r.motivo === 'credencial_invalida') {
      await admin.from('pagbank_edi_conexoes')
        .update({ status: 'credencial_invalida', ultimo_erro: r.mensagem }).eq('loja_id', sessao.lojaId)
    }
    return NextResponse.json({ ok: false, autenticou: r.motivo === 'credencial_invalida' ? false : null, mensagem: r.mensagem })
  }
  // Autenticou: tira o "credencial inválida" de um teste anterior.
  await admin.from('pagbank_edi_conexoes')
    .update({ status: 'ok', ultimo_erro: null }).eq('loja_id', sessao.lojaId).in('status', ['nova', 'credencial_invalida'])
  return NextResponse.json({ ok: true, autenticou: true, dia, validado: r.validado, temMovimento: r.detalhes.length > 0 })
}
