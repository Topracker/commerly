import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '../../lib/supabase-admin'
import { rateLimit } from '../../lib/rate-limit'
import { enviarPushParaUsuario } from '../../lib/push'
import { gerarCodigo, descreveCupom } from '../../lib/cupons'

const DIA_MS = 86_400_000
const DIAS_INATIVO = 30      // sumido a partir daqui
const COOLDOWN_DIAS = 30     // não reenviar campanha pro mesmo cliente antes disso
const VALIDADE_DIAS = 14     // validade do cupom

type Supa = ReturnType<typeof createServerClient>
type Admin = ReturnType<typeof createAdminClient>

/**
 * Quem pode receber a campanha:
 *   - cliente que comprou pelo app e não compra há DIAS_INATIVO+ dias;
 *   - seguidor da loja no feed há DIAS_INATIVO+ dias que não comprou nesse
 *     período (desde 2026-11-03: sem delivery quase ninguém tem pedido online,
 *     e o cupom agora vale no caixa — sql/2026-11-03-cupom-balcao.sql).
 * Quem recebeu campanha nos últimos COOLDOWN_DIAS fica de fora (ignorados).
 */
async function elegiveis(supabase: Supa, admin: Admin, lojaId: string) {
  const agora = Date.now()

  // Última compra de cada cliente (cancelados não contam como visita).
  const { data: pedidos } = await supabase
    .from('pedidos_clientes')
    .select('cliente_id, created_at')
    .eq('loja_id', lojaId)
    .neq('status', 'cancelado')

  const ultimaCompra = new Map<string, number>()
  for (const p of pedidos || []) {
    if (!p.cliente_id) continue
    const t = new Date(p.created_at as string).getTime()
    ultimaCompra.set(p.cliente_id as string, Math.max(ultimaCompra.get(p.cliente_id as string) ?? 0, t))
  }
  const sumido = (id: string) => {
    const t = ultimaCompra.get(id)
    return t === undefined || agora - t >= DIAS_INATIVO * DIA_MS
  }

  const alvos = new Set([...ultimaCompra.keys()].filter(sumido))

  // Seguidores antigos que não compraram no período.
  const { data: seguidores } = await admin
    .from('loja_seguidores')
    .select('cliente_id, created_at')
    .eq('loja_id', lojaId)
  for (const s of seguidores || []) {
    const id = s.cliente_id as string
    if (agora - new Date(s.created_at as string).getTime() >= DIAS_INATIVO * DIA_MS && sumido(id)) alvos.add(id)
  }

  // Cooldown: quem já recebeu campanha recente fica de fora.
  const desdeCooldown = new Date(agora - COOLDOWN_DIAS * DIA_MS).toISOString()
  const { data: recentes } = await supabase
    .from('campanhas_retorno')
    .select('cliente_id')
    .eq('loja_id', lojaId)
    .gte('enviada_em', desdeCooldown)
  const jaRecebeu = new Set((recentes || []).map((r: { cliente_id: unknown }) => r.cliente_id as string))

  const todos = [...alvos]
  return {
    aptos: todos.filter(id => !jaRecebeu.has(id)),
    ignorados: todos.filter(id => jaRecebeu.has(id)),
  }
}

async function contexto() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } },
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: NextResponse.json({ erro: 'Não autorizado' }, { status: 401 }) } as const
  const { data: loja } = await supabase
    .from('lojas').select('id, nome').eq('user_id', user.id).single()
  if (!loja) return { erro: NextResponse.json({ erro: 'Loja não encontrada' }, { status: 404 }) } as const
  return { supabase, user, loja } as const
}

/** Quantos clientes/seguidores podem receber a campanha agora (card do CRM). */
export async function GET() {
  const ctx = await contexto()
  if ('erro' in ctx) return ctx.erro
  const { aptos } = await elegiveis(ctx.supabase, createAdminClient(), ctx.loja.id)
  return NextResponse.json({ elegiveis: aptos.length })
}

/**
 * Envia a campanha de retorno: cliente sumido (ou seguidor que não compra) há
 * 30+ dias recebe um cupom pelo chat da loja, mais notificação e push. O cupom
 * vale no caixa da loja (registrar_venda_cupom) e no Modo Festa.
 *
 * Body: { cliente_ids?: string[], desconto_pct?: number }
 * Sem `cliente_ids`, dispara para todos os elegíveis.
 */
export async function POST(request: NextRequest) {
  const ctx = await contexto()
  if ('erro' in ctx) return ctx.erro
  const { supabase, user, loja } = ctx

  if (!rateLimit(`campanha-retorno:${user.id}`, 5, 60 * 60_000)) {
    return NextResponse.json({ erro: 'Muitos envios. Tente daqui a uma hora.' }, { status: 429 })
  }

  const body = await request.json().catch(() => ({}))
  const desconto = Math.min(90, Math.max(1, Number(body?.desconto_pct) || 15))
  const filtro: string[] | null = Array.isArray(body?.cliente_ids) ? body.cliente_ids : null

  const admin = createAdminClient()

  // 1) Elegíveis (sumidos + seguidores que não compram), já sem o cooldown.
  const agora = Date.now()
  const lista = await elegiveis(supabase, admin, loja.id)
  let alvos = lista.aptos
  let ignorados = lista.ignorados.length
  if (filtro) {
    alvos = alvos.filter(id => filtro.includes(id))
    ignorados = lista.ignorados.filter(id => filtro.includes(id)).length
  }
  if (alvos.length === 0) return NextResponse.json({ enviados: 0, ignorados })

  // 3) Dados dos clientes (user_id é o destinatário da notificação/push).
  const { data: clientes } = await admin
    .from('clientes').select('id, nome, user_id').in('id', alvos)

  const expiraEm = new Date(agora + VALIDADE_DIAS * DIA_MS).toISOString()
  let enviados = 0

  for (const c of clientes || []) {
    const cupom = {
      codigo: gerarCodigo(),
      loja_id: loja.id,
      cliente_id: c.id as string,
      tipo: 'percentual' as const,
      valor: desconto,
      origem: 'retorno',
      expira_em: expiraEm,
    }

    const { data: cupomRow, error: cupomErr } = await admin
      .from('cupons').insert(cupom).select('id').single()
    if (cupomErr) {
      // Colisão de código (23505) é raríssima; pular este cliente é melhor que
      // abortar a campanha inteira.
      console.error('[campanha-retorno] falha ao criar cupom:', cupomErr)
      continue
    }

    const primeiroNome = String(c.nome || 'tudo bem').split(' ')[0]
    // Vale para quem sumiu e para seguidor que ainda não comprou: sem
    // "sentimos sua falta". O cupom é usado no caixa da loja.
    const texto =
      `Oi, ${primeiroNome}! A ${loja.nome} preparou um cupom de ${descreveCupom(cupom)} pra você 💙\n` +
      `Código: *${cupom.codigo}* — é só mostrar no caixa da loja.\n` +
      `Válido por ${VALIDADE_DIAS} dias. Te esperamos!`

    const { error: msgErr } = await admin.from('mensagens_clientes').insert({
      loja_id: loja.id,
      cliente_id: c.id,
      remetente: 'loja',
      conteudo: texto,
    })
    if (msgErr) {
      console.error('[campanha-retorno] falha ao enviar mensagem:', msgErr)
      continue
    }

    await admin.from('campanhas_retorno').insert({
      loja_id: loja.id, cliente_id: c.id, cupom_id: cupomRow.id,
    })

    // Notificação in-app + push. Nenhum dos dois pode derrubar a campanha.
    if (c.user_id) {
      const titulo = `${loja.nome} tem um cupom pra você 🎁`
      const mensagem = `${descreveCupom(cupom)} com o código ${cupom.codigo}`
      const link = `/cliente/mensagens/${loja.id}`

      await admin.from('notificacoes').insert({
        user_id: c.user_id, tipo: 'cupom', titulo, mensagem, link,
        dados: { loja_id: loja.id, cupom_id: cupomRow.id },
      }).then(({ error }) => { if (error) console.error('[campanha-retorno] notificacao:', error) })

      await enviarPushParaUsuario(admin, c.user_id as string, { titulo, mensagem, link, tipo: 'cupom' })
        .catch(e => console.error('[campanha-retorno] push:', e))
    }

    enviados++
  }

  return NextResponse.json({ enviados, ignorados })
}
