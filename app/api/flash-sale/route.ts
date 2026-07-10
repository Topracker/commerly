// #13 Flash Sale — criação (fornecedor) e listagem das ativas (público).
//
// Ao criar, notificamos os clientes que já demonstraram interesse na categoria
// do fornecedor. "Interesse" aqui = já pediu de uma loja do mesmo nicho; não
// temos sinal melhor hoje, e é melhor do que notificar a base inteira.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '../../lib/supabase-admin'
import { rateLimit } from '../../lib/rate-limit'
import { supabaseDaRota, usuarioDaRota } from '../../lib/rotaSupabase'
import { enviarPushParaUsuario, pushConfigurado } from '../../lib/push'
import { DURACAO_PADRAO_MIN, DESCONTO_MIN, DESCONTO_MAX, estaAtiva, type FlashSale } from '../../lib/flashSale'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Teto de push por promoção, para não virar spam nem estourar o tempo da rota. */
const MAX_NOTIFICADOS = 200

export async function GET() {
  const admin = createAdminClient()
  const agora = new Date().toISOString()

  const { data, error } = await admin
    .from('flash_sales')
    .select('id, fornecedor_id, produto_id, titulo, desconto_percentual, inicia_em, termina_em, fornecedores(nome)')
    .lte('inicia_em', agora)
    .gt('termina_em', agora)
    .order('termina_em', { ascending: true })
    .limit(20)

  if (error) {
    console.error('[flash-sale] listagem falhou:', error.message)
    return NextResponse.json({ erro: 'Falha ao listar promoções.' }, { status: 500 })
  }

  return NextResponse.json({ promocoes: data ?? [] })
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)

  const titulo = typeof body?.titulo === 'string' ? body.titulo.trim().slice(0, 120) : ''
  const desconto = Number(body?.desconto_percentual)
  const duracaoMin = Number.isFinite(Number(body?.duracao_min)) ? Number(body.duracao_min) : DURACAO_PADRAO_MIN
  const produtoId = typeof body?.produto_id === 'string' ? body.produto_id : null

  if (!titulo) return NextResponse.json({ erro: 'Dê um título à promoção.' }, { status: 400 })
  if (!Number.isInteger(desconto) || desconto < DESCONTO_MIN || desconto > DESCONTO_MAX) {
    return NextResponse.json({ erro: `Desconto deve ser um inteiro entre ${DESCONTO_MIN}% e ${DESCONTO_MAX}%.` }, { status: 400 })
  }
  if (duracaoMin < 5 || duracaoMin > 24 * 60) {
    return NextResponse.json({ erro: 'Duração deve ficar entre 5 minutos e 24 horas.' }, { status: 400 })
  }

  const supabase = await supabaseDaRota()
  const user = await usuarioDaRota(supabase)
  if (!user) return NextResponse.json({ erro: 'Faça login.' }, { status: 401 })

  const { data: fornecedor } = await supabase
    .from('fornecedores').select('id, nome, categoria').eq('user_id', user.id).maybeSingle()
  if (!fornecedor) return NextResponse.json({ erro: 'Fornecedor não encontrado.' }, { status: 403 })

  if (!rateLimit(`flash-sale:${user.id}`, 5, 60 * 60_000)) {
    return NextResponse.json({ erro: 'Muitas promoções seguidas. Aguarde uma hora.' }, { status: 429 })
  }

  // Uma promoção ativa por vez: duas simultâneas confundem o countdown na UI.
  const agora = new Date()
  const { data: ativas } = await supabase
    .from('flash_sales')
    .select('id, inicia_em, termina_em')
    .eq('fornecedor_id', fornecedor.id)
    .gt('termina_em', agora.toISOString())

  if ((ativas ?? []).some(f => estaAtiva(f as FlashSale, agora))) {
    return NextResponse.json({ erro: 'Você já tem uma promoção ativa. Espere ela terminar.' }, { status: 409 })
  }

  const terminaEm = new Date(agora.getTime() + duracaoMin * 60_000)

  const { data: criada, error } = await supabase
    .from('flash_sales')
    .insert({
      fornecedor_id: fornecedor.id,
      produto_id: produtoId,
      titulo,
      desconto_percentual: desconto,
      inicia_em: agora.toISOString(),
      termina_em: terminaEm.toISOString(),
    })
    .select('id, titulo, desconto_percentual, termina_em')
    .single()

  if (error || !criada) {
    console.error('[flash-sale] insert falhou:', error?.message)
    return NextResponse.json({ erro: 'Não foi possível criar a promoção.' }, { status: 500 })
  }

  const notificados = await notificarInteressados(fornecedor.nome, criada.titulo, criada.desconto_percentual)

  return NextResponse.json({ promocao: criada, notificados })
}

/**
 * Notifica clientes que já compraram algo — o sinal de interesse mais próximo
 * que temos hoje. Falha aqui não derruba a promoção: ela já está criada.
 */
async function notificarInteressados(fornecedorNome: string, titulo: string, desconto: number): Promise<number> {
  try {
    const admin = createAdminClient()

    const { data: clientes } = await admin
      .from('clientes').select('user_id').not('user_id', 'is', null).limit(MAX_NOTIFICADOS)

    const alvos = (clientes ?? []).map(c => c.user_id as string)
    if (alvos.length === 0) return 0

    const mensagem = `${fornecedorNome}: ${desconto}% off por tempo limitado!`

    await admin.from('notificacoes').insert(
      alvos.map(user_id => ({
        user_id,
        tipo: 'flash_sale',
        titulo: `⚡ ${titulo}`,
        mensagem,
        link: '/cliente/feed',
        dados: { desconto },
      })),
    )

    if (pushConfigurado()) {
      await Promise.all(alvos.map(uid =>
        enviarPushParaUsuario(admin, uid, {
          titulo: `⚡ ${titulo}`, mensagem, link: '/cliente/feed', tipo: 'flash_sale', tag: 'flash_sale',
        }),
      ))
    }

    return alvos.length
  } catch (e) {
    console.error('[flash-sale] falha ao notificar interessados:', e)
    return 0
  }
}
