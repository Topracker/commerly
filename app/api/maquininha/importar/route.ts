import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { rateLimit } from '../../../lib/rate-limit'
import { diaLoja } from '../../../lib/datas'
import { ArquivoInvalido, TAMANHO_MAX_ARQUIVO, lerArquivo } from '../../../lib/maquininhaArquivo'
import {
  MAQUININHAS, interpretarTabela, interpretarTextoPdf, linhaVendaImportada,
  type Maquininha, type ResultadoLeitura,
} from '../../../lib/maquininhaImport'

// Prévia e confirmação usam a mesma rota: `confirmar=1` grava. O arquivo vem de
// novo na confirmação e é relido aqui, para o que grava ser o que foi conferido
// agora, e não algo devolvido pelo navegador.
//
// Grava com a sessão do lojista (chave anon), NUNCA service role: a RLS de
// `vendas` garante a loja e o paywall.

const MAX_VENDAS = 5000
const LOTE = 500

const ativando = () => NextResponse.json(
  { erro: 'A importação está sendo ativada. Tente de novo em alguns minutos.' },
  { status: 503 },
)
// Coluna inexistente: o código chegou antes da migração.
const colunaFaltando = (code?: string) => code === '42703' || code === 'PGRST204'

function emLotes<T>(xs: T[], n: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n))
  return out
}

export async function POST(request: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } },
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 })

  if (!rateLimit(`maquininha-importar:${user.id}`, 20, 60_000)) {
    return NextResponse.json({ erro: 'Muitas tentativas seguidas. Espere um minuto.' }, { status: 429 })
  }

  const { data: loja } = await supabase.from('lojas').select('id').eq('user_id', user.id).maybeSingle()
  if (!loja) return NextResponse.json({ erro: 'Loja não encontrada.' }, { status: 404 })

  const form = await request.formData().catch(() => null)
  const arquivo = form?.get('arquivo')
  const maquininha = String(form?.get('maquininha') ?? '') as Maquininha
  const confirmar = form?.get('confirmar') === '1'

  if (!MAQUININHAS.includes(maquininha)) return NextResponse.json({ erro: 'Escolha a maquininha.' }, { status: 400 })
  if (!(arquivo instanceof File)) return NextResponse.json({ erro: 'Escolha o arquivo do extrato.' }, { status: 400 })
  if (arquivo.size === 0) return NextResponse.json({ erro: 'Esse arquivo está vazio.' }, { status: 400 })
  if (arquivo.size > TAMANHO_MAX_ARQUIVO) {
    return NextResponse.json({ erro: 'Arquivo muito grande (máximo 4 MB). Exporte um período menor.' }, { status: 413 })
  }

  let leitura: ResultadoLeitura
  let ehPdf = false
  try {
    const conteudo = await lerArquivo(new Uint8Array(await arquivo.arrayBuffer()), arquivo.name)
    ehPdf = conteudo.tipo === 'texto'
    leitura = conteudo.tipo === 'texto'
      ? interpretarTextoPdf(conteudo.linhas)
      : interpretarTabela(conteudo.linhas, maquininha)
  } catch (e) {
    if (e instanceof ArquivoInvalido) return NextResponse.json({ erro: e.message }, { status: 400 })
    throw e
  }

  if (leitura.vendas.length > MAX_VENDAS) {
    return NextResponse.json({ erro: `Esse extrato tem mais de ${MAX_VENDAS} vendas. Exporte um período menor.` }, { status: 413 })
  }
  const ignoradas = {
    canceladas: leitura.canceladas,
    semId: leitura.semId,
    invalidas: leitura.invalidas,
    repetidasNoArquivo: leitura.repetidasNoArquivo,
  }
  if (leitura.vendas.length === 0) {
    return NextResponse.json({
      ok: false,
      erro: ehPdf
        ? 'Não encontramos vendas nesse PDF. Se puder, baixe o extrato em CSV ou Excel.'
        : leitura.colunasFaltando.length > 0
          ? `Não encontramos a coluna de ${leitura.colunasFaltando.join(', ')} nesse arquivo.`
          : 'Não encontramos vendas válidas nesse arquivo.',
      ignoradas,
      colunas: leitura.cabecalho.slice(0, 30),
    }, { status: 422 })
  }

  // Quantas já existem nesta loja: importadas antes ou vindas de integração.
  const ids = leitura.vendas.map(v => v.id)
  const existentes = new Set<string>()
  for (const lote of emLotes(ids, LOTE)) {
    const { data, error } = await supabase.from('vendas').select('id_externo')
      .eq('loja_id', loja.id).eq('adquirente', maquininha).in('id_externo', lote)
    if (error) {
      if (colunaFaltando(error.code)) return ativando()
      console.error('[maquininha] erro ao buscar existentes:', error.code, error.message)
      return NextResponse.json({ erro: 'Não foi possível conferir as vendas agora.' }, { status: 500 })
    }
    for (const v of data ?? []) existentes.add(String(v.id_externo))

    const colunaIntegracao = maquininha === 'pagbank' ? 'pb_charge_id' : maquininha === 'mercadopago' ? 'mp_payment_id' : null
    if (colunaIntegracao) {
      const { data: integ, error: erroInteg } = await supabase.from('vendas').select(colunaIntegracao)
        .eq('loja_id', loja.id).in(colunaIntegracao, lote)
      if (erroInteg) {
        console.error('[maquininha] erro ao buscar integração:', erroInteg.code, erroInteg.message)
        return NextResponse.json({ erro: 'Não foi possível conferir as vendas agora.' }, { status: 500 })
      }
      for (const v of (integ ?? []) as unknown as Record<string, unknown>[]) {
        existentes.add(String(v[colunaIntegracao]).toUpperCase())
      }
    }
  }

  const novas = leitura.vendas.filter(v => !existentes.has(v.id))
  const jaExistiam = leitura.vendas.length - novas.length

  if (!confirmar) {
    // Venda lançada à mão no caixa no mesmo dia e valor pode ser a mesma venda.
    // Só avisa: não dá para saber com certeza, então quem decide é o lojista.
    let possiveisDuplicadas = 0
    if (novas.length > 0) {
      const datas = novas.map(v => v.data).sort()
      const { data: manuais } = await supabase.from('vendas').select('valor_total, created_at, forma_pagamento')
        .eq('loja_id', loja.id).eq('origem', 'manual')
        .gte('created_at', new Date(new Date(datas[0]).getTime() - 86_400_000).toISOString())
        .lte('created_at', new Date(new Date(datas[datas.length - 1]).getTime() + 86_400_000).toISOString())
        .limit(5000)
      const contagem = new Map<string, number>()
      for (const m of manuais ?? []) {
        if (String(m.forma_pagamento).toLowerCase() === 'dinheiro') continue
        const k = `${diaLoja(m.created_at as string)}|${Number(m.valor_total).toFixed(2)}`
        contagem.set(k, (contagem.get(k) ?? 0) + 1)
      }
      for (const v of novas) {
        const k = `${diaLoja(v.data)}|${v.bruto.toFixed(2)}`
        const n = contagem.get(k) ?? 0
        if (n > 0) { possiveisDuplicadas++; contagem.set(k, n - 1) }
      }
    }

    const soma = (f: (v: typeof novas[number]) => number) => Math.round(novas.reduce((s, v) => s + f(v), 0) * 100) / 100
    const ordenadas = leitura.vendas.map(v => v.data).sort()
    return NextResponse.json({
      ok: true,
      previa: {
        totalNoArquivo: leitura.vendas.length,
        novas: novas.length,
        jaExistiam,
        totalBruto: soma(v => v.bruto),
        totalLiquido: soma(v => v.liquido ?? v.bruto),
        semLiquido: novas.filter(v => v.liquido === null).length,
        de: ordenadas[0],
        ate: ordenadas[ordenadas.length - 1],
        possiveisDuplicadas,
        ehPdf,
        ignoradas,
        amostra: novas.slice(0, 8),
      },
    })
  }

  // ignoreDuplicates: dois cliques ou duas abas não duplicam a venda.
  let gravadas = 0
  for (const lote of emLotes(novas.map(v => linhaVendaImportada(v, loja.id, maquininha)), LOTE)) {
    const { data, error } = await supabase.from('vendas')
      .upsert(lote, { onConflict: 'loja_id,adquirente,id_externo', ignoreDuplicates: true })
      .select('id')
    if (error) {
      if (colunaFaltando(error.code) || error.code === '42P10') return ativando()
      console.error('[maquininha] erro ao gravar:', error.code, error.message)
      return NextResponse.json({ erro: 'Não foi possível salvar as vendas. Nada foi perdido: tente de novo.', gravadas }, { status: 500 })
    }
    gravadas += data?.length ?? 0
  }

  return NextResponse.json({ ok: true, gravadas, jaExistiam: leitura.vendas.length - gravadas })
}
