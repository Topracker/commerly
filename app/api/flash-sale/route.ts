// #13 Flash Sale — criação (fornecedor OU comerciante) e listagem das ativas.
//
// Fornecedor: ao criar, notificamos os clientes da base (até MAX_NOTIFICADOS).
// Comerciante (desde 2026-11-03, sql/2026-11-03-flash-sale-loja.sql): a
// promoção grava `loja_id` e avisa só quem SEGUE a loja no feed.
// A flash sale é um aviso com countdown — não altera o preço do pedido.

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

const CAMPOS_BASE = 'id, fornecedor_id, produto_id, titulo, desconto_percentual, inicia_em, termina_em, fornecedores(nome)'

type LinhaFlash = Record<string, unknown> & { loja_id?: string | null }

export async function GET() {
  const admin = createAdminClient()
  const agora = new Date().toISOString()

  const listar = (campos: string) => admin
    .from('flash_sales')
    .select(campos)
    .lte('inicia_em', agora)
    .gt('termina_em', agora)
    .order('termina_em', { ascending: true })
    .limit(20)

  // Com a coluna loja_id; se a migração ainda não foi aplicada, cai na
  // listagem antiga (só fornecedor) em vez de derrubar o banner.
  let { data, error } = await listar(`${CAMPOS_BASE}, loja_id`)
  if (error) ({ data, error } = await listar(CAMPOS_BASE))

  if (error) {
    console.error('[flash-sale] listagem falhou:', error.message)
    return NextResponse.json({ erro: 'Falha ao listar promoções.' }, { status: 500 })
  }

  let promocoes = (data ?? []) as unknown as LinhaFlash[]

  // Nome da loja pela view pública: loja oculta da vitrine (ou sem cidade)
  // não aparece em lojas_publicas, e a promoção dela também não aparece.
  const lojaIds = [...new Set(promocoes.map(p => p.loja_id).filter((x): x is string => !!x))]
  if (lojaIds.length > 0) {
    const { data: lojas } = await admin.from('lojas_publicas').select('id, nome').in('id', lojaIds)
    const porId = new Map((lojas ?? []).map(l => [l.id as string, l as { id: string; nome: string }]))
    promocoes = promocoes
      .filter(p => !p.loja_id || porId.has(p.loja_id))
      .map(p => (p.loja_id ? { ...p, lojas: porId.get(p.loja_id) } : p))
  }

  return NextResponse.json({ promocoes })
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

  // Dono da promoção: fornecedor (como antes) ou loja do comerciante.
  const { data: fornecedor } = await supabase
    .from('fornecedores').select('id, nome').eq('user_id', user.id).maybeSingle()
  let dono: { coluna: 'fornecedor_id' | 'loja_id'; id: string; nome: string }
  if (fornecedor) {
    dono = { coluna: 'fornecedor_id', id: fornecedor.id, nome: fornecedor.nome }
  } else {
    const { data: loja } = await supabase
      .from('lojas').select('id, nome').eq('user_id', user.id).maybeSingle()
    if (!loja) return NextResponse.json({ erro: 'Perfil não encontrado.' }, { status: 403 })
    dono = { coluna: 'loja_id', id: loja.id, nome: loja.nome }
  }

  if (!rateLimit(`flash-sale:${user.id}`, 5, 60 * 60_000)) {
    return NextResponse.json({ erro: 'Muitas promoções seguidas. Aguarde uma hora.' }, { status: 429 })
  }

  // Uma promoção ativa por vez: duas simultâneas confundem o countdown na UI.
  const agora = new Date()
  const { data: ativas } = await supabase
    .from('flash_sales')
    .select('id, inicia_em, termina_em')
    .eq(dono.coluna, dono.id)
    .gt('termina_em', agora.toISOString())

  if ((ativas ?? []).some(f => estaAtiva(f as FlashSale, agora))) {
    return NextResponse.json({ erro: 'Você já tem uma promoção ativa. Espere ela terminar.' }, { status: 409 })
  }

  const terminaEm = new Date(agora.getTime() + duracaoMin * 60_000)

  const { data: criada, error } = await supabase
    .from('flash_sales')
    .insert({
      [dono.coluna]: dono.id,
      // produto_id aponta para fornecedor_produtos: só faz sentido no fornecedor.
      produto_id: dono.coluna === 'fornecedor_id' ? produtoId : null,
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

  const notificados = dono.coluna === 'loja_id'
    ? await notificarSeguidores(dono.id, dono.nome, criada.titulo, criada.desconto_percentual)
    : await notificarInteressados(dono.nome, criada.titulo, criada.desconto_percentual)

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
    return await notificar(alvos, `${fornecedorNome}: ${desconto}% off por tempo limitado!`, titulo, desconto, '/cliente/feed')
  } catch (e) {
    console.error('[flash-sale] falha ao notificar interessados:', e)
    return 0
  }
}

/** Flash sale da loja: avisa quem segue a loja no feed. */
async function notificarSeguidores(lojaId: string, lojaNome: string, titulo: string, desconto: number): Promise<number> {
  try {
    const admin = createAdminClient()
    const { data: seguidores } = await admin
      .from('loja_seguidores').select('clientes(user_id)').eq('loja_id', lojaId).limit(MAX_NOTIFICADOS)

    const alvos = [...new Set((seguidores ?? [])
      .map(s => (s.clientes as unknown as { user_id: string | null } | null)?.user_id)
      .filter((x): x is string => !!x))]
    return await notificar(alvos, `${lojaNome}: ${desconto}% off por tempo limitado!`, titulo, desconto, `/cliente/loja/${lojaId}`)
  } catch (e) {
    console.error('[flash-sale] falha ao notificar seguidores:', e)
    return 0
  }
}

/** Notificação no app + push. Falha aqui não derruba a promoção. */
async function notificar(alvos: string[], mensagem: string, titulo: string, desconto: number, link: string): Promise<number> {
  if (alvos.length === 0) return 0
  const admin = createAdminClient()
  try {
    await admin.from('notificacoes').insert(
      alvos.map(user_id => ({
        user_id,
        tipo: 'flash_sale',
        titulo: `⚡ ${titulo}`,
        mensagem,
        link,
        dados: { desconto },
      })),
    )

    if (pushConfigurado()) {
      await Promise.all(alvos.map(uid =>
        enviarPushParaUsuario(admin, uid, {
          titulo: `⚡ ${titulo}`, mensagem, link, tipo: 'flash_sale', tag: 'flash_sale',
        }),
      ))
    }

    return alvos.length
  } catch (e) {
    console.error('[flash-sale] falha ao notificar:', e)
    return 0
  }
}
