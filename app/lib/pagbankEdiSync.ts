// Sincronização da maquininha PagBank pelo Extrato EDI. Usada pelo cron diário
// (/api/maquininha/pagbank-edi/cron) e pelo "Sincronizar agora".
//
// Roda com SERVICE ROLE (o cron não tem sessão), então TODA query aqui filtra
// por loja_id na mão. O paywall é checado por quem chama.
import type { createAdminClient } from './supabase-admin'
import {
  ADQUIRENTE_EDI, buscarDiaEdi, diasPendentes, interpretarMovimento, linhaVendaEdi,
} from './pagbankEdi'
import { decifrarToken } from './pagbankEdiCripto'

type Admin = ReturnType<typeof createAdminClient>
export type OrigemSync = 'cron' | 'manual'
export type StatusEdi = 'nova' | 'ok' | 'aguardando' | 'credencial_invalida' | 'erro'

export type DiaSincronizado = {
  dia: string
  validado: boolean | null
  linhas: number
  novas: number
  jaExistiam: number
  canceladas: number
  ajustadas: number
  online: number
  brutoNovas: number
  erro?: string
}

export type ResultadoSyncEdi = {
  ok: boolean
  status: StatusEdi
  dias: DiaSincronizado[]
  novas: number
  mensagem?: string
}

const LOTE = 300

function emLotes<T>(xs: T[], n: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n))
  return out
}

const arred = (n: number) => Math.round(n * 100) / 100

/** Credenciais decifradas da loja, ou null (sem cadastro / chave trocada). */
export async function credenciaisDaLoja(admin: Admin, lojaId: string): Promise<
  { estabelecimento: string; token: string; ultimoDiaValidado: string | null } | null
> {
  const [{ data: con }, { data: seg }] = await Promise.all([
    admin.from('pagbank_edi_conexoes').select('estabelecimento, ultimo_dia_validado').eq('loja_id', lojaId).maybeSingle(),
    admin.from('pagbank_edi_segredos').select('token_cifrado').eq('loja_id', lojaId).maybeSingle(),
  ])
  if (!con || !seg) return null
  try {
    return {
      estabelecimento: String(con.estabelecimento),
      token: decifrarToken(String(seg.token_cifrado), lojaId),
      ultimoDiaValidado: (con.ultimo_dia_validado as string | null) ?? null,
    }
  } catch {
    return null
  }
}

/** Grava as vendas novas de um dia e abate cancelamentos de dias anteriores. */
async function gravarDia(admin: Admin, lojaId: string, dia: string, detalhes: Parameters<typeof interpretarMovimento>[0]):
  Promise<DiaSincronizado> {
  const mov = interpretarMovimento(detalhes, dia)
  const r: DiaSincronizado = {
    dia, validado: true, linhas: mov.linhas, novas: 0, jaExistiam: 0,
    canceladas: mov.canceladas, ajustadas: 0, online: 0, brutoNovas: 0,
  }

  // Já está no banco? Pelo id do EDI (sync anterior ou importação por arquivo do
  // PagBank, mesma chave) ou pela integração PagBank antiga (pb_charge_id).
  const existentes = new Set<string>()
  for (const lote of emLotes(mov.vendas.map(v => v.id), LOTE)) {
    const [porId, porCharge] = await Promise.all([
      admin.from('vendas').select('id_externo').eq('loja_id', lojaId).eq('adquirente', ADQUIRENTE_EDI).in('id_externo', lote),
      admin.from('vendas').select('pb_charge_id').eq('loja_id', lojaId).in('pb_charge_id', lote),
    ])
    if (porId.error || porCharge.error) throw new Error('falha ao conferir vendas existentes')
    for (const v of porId.data ?? []) existentes.add(String(v.id_externo).toUpperCase())
    for (const v of porCharge.data ?? []) existentes.add(String(v.pb_charge_id).toUpperCase())
  }
  const novas = mov.vendas.filter(v => !existentes.has(v.id))
  r.jaExistiam = mov.vendas.length - novas.length

  for (const lote of emLotes(novas.map(v => linhaVendaEdi(v, lojaId)), LOTE)) {
    // ignoreDuplicates: cron e "Sincronizar agora" ao mesmo tempo não duplicam.
    const { data, error } = await admin.from('vendas')
      .upsert(lote, { onConflict: 'loja_id,adquirente,id_externo', ignoreDuplicates: true })
      .select('id_externo, valor_total, captura')
    if (error) throw new Error(`falha ao gravar vendas (${error.code})`)
    for (const v of data ?? []) {
      r.novas++
      r.brutoNovas = arred(r.brutoNovas + Number(v.valor_total))
      if (v.captura === 'online') r.online++
    }
  }
  r.jaExistiam += novas.length - r.novas

  // Cancelamento/chargeback de venda de outro dia: abate ou apaga a venda.
  for (const a of mov.ajustes) {
    const { data: venda } = await admin.from('vendas').select('id, valor_total, valor_liquido')
      .eq('loja_id', lojaId).eq('adquirente', ADQUIRENTE_EDI).eq('id_externo', a.id).maybeSingle()
    if (!venda) continue // venda anterior ao período sincronizado: nada a abater
    const bruto = arred(Number(venda.valor_total) - a.bruto)
    if (bruto <= 0.009) {
      const { data } = await admin.from('vendas').delete().eq('id', venda.id).eq('loja_id', lojaId).select('id')
      if (data?.length) r.ajustadas++
    } else {
      const liquido = venda.valor_liquido != null && a.liquido != null
        ? arred(Math.max(0, Number(venda.valor_liquido) - a.liquido)) : null
      const { data } = await admin.from('vendas')
        .update({ valor_total: bruto, valor_liquido: liquido, taxa: liquido == null ? null : arred(bruto - liquido) })
        .eq('id', venda.id).eq('loja_id', lojaId).select('id')
      if (data?.length) r.ajustadas++
    }
  }
  return r
}

async function registrar(admin: Admin, lojaId: string, origem: OrigemSync | 'teste', d: Partial<DiaSincronizado> & { dia: string }, http?: number) {
  await admin.from('pagbank_edi_sincronizacoes').insert({
    loja_id: lojaId, dia: d.dia, origem, http_status: http ?? null, validado: d.validado ?? null,
    linhas: d.linhas ?? 0, vendas_novas: d.novas ?? 0, ja_existiam: d.jaExistiam ?? 0,
    canceladas: d.canceladas ?? 0, ajustadas: d.ajustadas ?? 0, online: d.online ?? 0,
    bruto_novas: d.brutoNovas ?? 0, erro: d.erro?.slice(0, 300) ?? null,
  })
}

/**
 * Busca do dia seguinte ao último validado até ontem. Para no primeiro dia que
 * o PagBank ainda não fechou (VALIDADO = FALSE): a próxima passada continua
 * dali. `prazo` é o instante limite (ms) para não estourar o tempo da função.
 */
export async function sincronizarLojaEdi(
  admin: Admin, lojaId: string, origem: OrigemSync, opts: { prazo?: number; agora?: Date } = {},
): Promise<ResultadoSyncEdi> {
  const cred = await credenciaisDaLoja(admin, lojaId)
  const fim = async (status: StatusEdi, erro: string | null) => {
    await admin.from('pagbank_edi_conexoes')
      .update({ status, ultimo_erro: erro, ultima_sincronizacao: new Date().toISOString(), atualizado_em: new Date().toISOString() })
      .eq('loja_id', lojaId)
  }
  if (!cred) {
    const msg = 'Não foi possível ler o token salvo. Cadastre o token EDI de novo.'
    await fim('erro', msg)
    return { ok: false, status: 'erro', dias: [], novas: 0, mensagem: msg }
  }

  const dias: DiaSincronizado[] = []
  let status: StatusEdi = 'ok'
  let erro: string | null = null
  for (const dia of diasPendentes(cred.ultimoDiaValidado, opts.agora)) {
    if (opts.prazo && Date.now() > opts.prazo) break // continua na próxima passada
    const resp = await buscarDiaEdi(cred.estabelecimento, cred.token, dia)
    if (!resp.ok) {
      status = resp.motivo === 'credencial_invalida' ? 'credencial_invalida' : resp.motivo === 'limite' ? 'aguardando' : 'erro'
      erro = resp.mensagem
      const d = { dia, validado: null, linhas: 0, novas: 0, jaExistiam: 0, canceladas: 0, ajustadas: 0, online: 0, brutoNovas: 0, erro }
      dias.push(d)
      await registrar(admin, lojaId, origem, d, resp.status)
      break
    }
    if (!resp.validado) {
      status = 'aguardando'
      erro = `O PagBank ainda está fechando o dia ${dia.split('-').reverse().join('/')}. Tentamos de novo mais tarde.`
      const d = { dia, validado: false, linhas: resp.detalhes.length, novas: 0, jaExistiam: 0, canceladas: 0, ajustadas: 0, online: 0, brutoNovas: 0 }
      dias.push(d)
      await registrar(admin, lojaId, origem, d, resp.status)
      break
    }
    let d: DiaSincronizado
    try {
      d = await gravarDia(admin, lojaId, dia, resp.detalhes)
    } catch (e) {
      status = 'erro'
      erro = 'Não foi possível salvar as vendas agora. Tentamos de novo na próxima sincronização.'
      console.error('[pagbank-edi] erro ao gravar dia', dia, 'loja', lojaId, (e as Error).message)
      const falha = { dia, validado: true, linhas: resp.detalhes.length, novas: 0, jaExistiam: 0, canceladas: 0, ajustadas: 0, online: 0, brutoNovas: 0, erro: (e as Error).message }
      dias.push(falha)
      await registrar(admin, lojaId, origem, falha, resp.status)
      break
    }
    dias.push(d)
    await registrar(admin, lojaId, origem, d, resp.status)
    // Só avança depois de gravar: falhou no meio, o dia é buscado de novo.
    await admin.from('pagbank_edi_conexoes').update({ ultimo_dia_validado: dia }).eq('loja_id', lojaId)
  }

  await fim(status, erro)
  return {
    ok: status === 'ok' || status === 'aguardando',
    status,
    dias,
    novas: dias.reduce((s, d) => s + d.novas, 0),
    mensagem: erro ?? undefined,
  }
}

export { registrar as registrarSincronizacaoEdi }
