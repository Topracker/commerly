import type { SupabaseClient } from '@supabase/supabase-js'
import { nivelDe, nivelXp, NIVEIS_POR_PAPEL, NIVEIS_COMERCIANTE, NIVEIS_ENTREGADOR, NIVEIS_CLIENTE } from './crescimento'

// ============================================================================
// Motor de gamificação — reconciliação idempotente (pull-based).
// ----------------------------------------------------------------------------
// Em vez de editar todos os fluxos de INSERT do app, computamos o estado do
// usuário a partir das tabelas-fonte (pedidos, entregas, avaliações, indicações,
// idade da conta) e concedemos XP, missões e medalhas de forma idempotente.
// Chamado pelos dashboards no carregamento (via /api/gamificacao/sync).
// ============================================================================

export type Papel = 'comerciante' | 'cliente' | 'entregador' | 'fornecedor'

export type PerfilGamificacao = {
  papel: Papel
  nome: string
  xp: number
  nivelXp: { nivel: number; pct: number; faltam: number }
  nivelPapel: { nome: string; emoji: string; cor: string; min: number; beneficios: string[]; proximoNome: string | null; pct: number; faltam: number; metricaLabel: string; metricaValor: number }
  medalhas: { slug: string; concedida_em: string }[]
  missoes: string[]
  streak: { dias: number; recorde: number }
  comunidade: { comerciantes: number; clientes: number; entregadores: number; pontosCidade: number }
  creditos: number
  mesesGratis: number
}

function grantMedalhas(admin: SupabaseClient, userId: string, slugs: string[]) {
  if (slugs.length === 0) return Promise.resolve()
  return admin.from('medalhas_usuarios')
    .upsert(slugs.map(slug => ({ user_id: userId, slug })), { onConflict: 'user_id,slug', ignoreDuplicates: true })
    .then(() => {})
}
function grantMissoes(admin: SupabaseClient, userId: string, slugs: string[]) {
  if (slugs.length === 0) return Promise.resolve()
  return admin.from('missoes_usuarios')
    .upsert(slugs.map(slug => ({ user_id: userId, slug })), { onConflict: 'user_id,slug', ignoreDuplicates: true })
    .then(() => {})
}

async function atualizarStreak(admin: SupabaseClient, userId: string) {
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
  const hojeStr = hoje.toISOString().slice(0, 10)
  const { data } = await admin.from('streaks').select('dias, recorde, ultimo_dia').eq('user_id', userId).maybeSingle()
  let dias = 1
  let recorde = 1
  if (data) {
    if (data.ultimo_dia === hojeStr) { return { dias: data.dias, recorde: data.recorde } }
    const ontem = new Date(hoje.getTime() - 86400000).toISOString().slice(0, 10)
    dias = data.ultimo_dia === ontem ? (data.dias || 0) + 1 : 1
    recorde = Math.max(data.recorde || 0, dias)
  }
  await admin.from('streaks').upsert({ user_id: userId, dias, recorde, ultimo_dia: hojeStr, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
  return { dias, recorde }
}

export async function reconciliarUsuario(admin: SupabaseClient, userId: string): Promise<PerfilGamificacao | null> {
  // Descobre papel + entidade.
  const [{ data: loja }, { data: cli }, { data: ent }, { data: forn }] = await Promise.all([
    admin.from('lojas').select('id, nome, tipo, created_at').eq('user_id', userId).maybeSingle(),
    admin.from('clientes').select('id, nome, telefone, cpf, created_at').eq('user_id', userId).maybeSingle(),
    admin.from('entregadores').select('id, nome, telefone, created_at').eq('user_id', userId).maybeSingle(),
    admin.from('fornecedores').select('id, nome, created_at').eq('user_id', userId).maybeSingle(),
  ])

  let papel: Papel = 'cliente'
  let nome = 'Usuário'
  let createdAt = new Date().toISOString()
  if (loja) { papel = 'comerciante'; nome = loja.nome; createdAt = loja.created_at }
  else if (ent) { papel = 'entregador'; nome = ent.nome; createdAt = ent.created_at }
  else if (forn) { papel = 'fornecedor'; nome = forn.nome; createdAt = forn.created_at }
  else if (cli) { papel = 'cliente'; nome = cli.nome; createdAt = cli.created_at }
  else return null

  const ageDays = Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000)

  // Estatísticas por papel.
  let pedidosFeitos = 0, entregas = 0, pedidosRecebidos = 0, avaliacoesDadas = 0
  let avalMedia = 0, avalCount = 0, primeiroPedidoHora: number | null = null
  const idealMedalhas: string[] = []
  const missoes: string[] = []

  if (papel === 'cliente' && cli) {
    const [{ count: pc }, { data: prim }, { count: avc }] = await Promise.all([
      admin.from('pedidos_clientes').select('id', { count: 'exact', head: true }).eq('cliente_id', cli.id),
      admin.from('pedidos_clientes').select('created_at').eq('cliente_id', cli.id).order('created_at', { ascending: true }).limit(1),
      admin.from('avaliacoes_lojas').select('id', { count: 'exact', head: true }).eq('cliente_id', cli.id),
    ])
    pedidosFeitos = pc || 0
    avaliacoesDadas = avc || 0
    if (prim && prim[0]) primeiroPedidoHora = new Date(prim[0].created_at).getHours()
    if (pedidosFeitos >= 1) { idealMedalhas.push('primeira-compra'); missoes.push('primeiro-pedido') }
    if (pedidosFeitos >= 10) missoes.push('10-pedidos')
    if (pedidosFeitos >= 100) idealMedalhas.push('maratonista')
    if (pedidosFeitos >= 200) idealMedalhas.push('cliente-vip')
    if (nome && (cli.telefone || cli.cpf)) missoes.push('completar-perfil')
  } else if (papel === 'entregador' && ent) {
    const { count: ec } = await admin.from('pedidos_clientes').select('id', { count: 'exact', head: true }).eq('entregador_id', ent.id).eq('status', 'entregue')
    entregas = ec || 0
    if (entregas >= 1) { idealMedalhas.push('primeira-entrega'); missoes.push('primeira-entrega') }
    if (entregas >= 100) missoes.push('100-entregas')
    if (nome && ent.telefone) missoes.push('completar-perfil')
  } else if (papel === 'comerciante' && loja) {
    const [{ count: pr }, { data: aval }, { data: fund }] = await Promise.all([
      admin.from('pedidos_clientes').select('id', { count: 'exact', head: true }).eq('loja_id', loja.id),
      admin.from('avaliacoes_lojas_atuais').select('nota').eq('loja_id', loja.id),
      admin.from('fundadores').select('loja_id').eq('loja_id', loja.id).maybeSingle(),
    ])
    pedidosRecebidos = pr || 0
    const notas = (aval || []).map((a: any) => Number(a.nota)).filter((n: number) => n > 0)
    avalCount = notas.length
    avalMedia = avalCount > 0 ? notas.reduce((s: number, n: number) => s + n, 0) / avalCount : 0
    if (fund) idealMedalhas.push('fundador')
    if (avalCount >= 50 && avalMedia >= 4.95) idealMedalhas.push('estrela')
    missoes.push('cadastrar-comercio')
    if (nome && loja.tipo) missoes.push('completar-perfil')
  }

  // Indicações confirmadas + comunidade.
  const { data: indics } = await admin
    .from('indicacoes').select('papel_indicado').eq('indicador_user_id', userId).in('status', ['confirmada', 'recompensada'])
  const indicCount = indics?.length || 0
  const comunidade = { comerciantes: 0, clientes: 0, entregadores: 0, pontosCidade: 0 }
  for (const r of indics || []) {
    if (r.papel_indicado === 'comerciante') comunidade.comerciantes++
    else if (r.papel_indicado === 'entregador') comunidade.entregadores++
    else comunidade.clientes++
  }
  if (indicCount >= 1) idealMedalhas.push('embaixador')
  if (indicCount >= 50) idealMedalhas.push('super-embaixador')
  if (indicCount >= 3) missoes.push('convidar-3')

  const { data: pts } = await admin.from('expansao_pontos').select('pontos').eq('user_id', userId)
  comunidade.pontosCidade = (pts || []).reduce((s: number, p: any) => s + (p.pontos || 0), 0)

  // Conta + streak → medalhas de tempo/segredo.
  if (ageDays >= 365) idealMedalhas.push('fa-da-commerly')
  const streak = await atualizarStreak(admin, userId)
  if (streak.recorde >= 100) idealMedalhas.push('centenario')
  if (primeiroPedidoHora === 0) idealMedalhas.push('coruja')

  // Concede medalhas e missões (idempotente).
  await Promise.all([grantMedalhas(admin, userId, idealMedalhas), grantMissoes(admin, userId, missoes)])

  // Lê o estado final concedido (fonte da verdade para exibir).
  const [{ data: medalhasRows }, { data: missoesRows }, { data: creditosRows }, { data: beneficiosRows }] = await Promise.all([
    admin.from('medalhas_usuarios').select('slug, concedida_em').eq('user_id', userId).order('concedida_em', { ascending: false }),
    admin.from('missoes_usuarios').select('slug').eq('user_id', userId),
    admin.from('creditos_mov').select('valor').eq('user_id', userId),
    admin.from('beneficios_indicacao').select('quantidade, tipo, consumido').eq('user_id', userId).eq('tipo', 'mes_gratis').eq('consumido', false),
  ])
  const missoesCompletas = (missoesRows || []).map((m: any) => m.slug)

  // XP computado (idempotente — SET, não incrementa).
  const xp = Math.round(
    pedidosFeitos * 10 + entregas * 15 + pedidosRecebidos * 8 +
    avaliacoesDadas * 5 + indicCount * 20 + missoesCompletas.length * 10 +
    (streak.dias > 1 ? streak.dias * 2 : 0),
  )
  await admin.from('xp_usuarios').upsert({ user_id: userId, papel, xp, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })

  // Nível por papel (métrica: pedidos/entregas conforme papel).
  const niveis = NIVEIS_POR_PAPEL[papel] || NIVEIS_CLIENTE
  const metricaValor = papel === 'comerciante' ? pedidosRecebidos : papel === 'entregador' ? entregas : pedidosFeitos
  const metricaLabel = papel === 'entregador' ? 'entregas' : 'pedidos'
  const nvl = nivelDe(niveis, metricaValor)

  const creditos = (creditosRows || []).reduce((s: number, c: any) => s + Number(c.valor || 0), 0)
  const mesesGratis = (beneficiosRows || []).reduce((s: number, b: any) => s + Number(b.quantidade || 0), 0)

  return {
    papel, nome, xp,
    nivelXp: nivelXp(xp),
    nivelPapel: {
      nome: nvl.atual.nome, emoji: nvl.atual.emoji, cor: nvl.atual.cor, min: nvl.atual.min,
      beneficios: nvl.atual.beneficios, proximoNome: nvl.proximo?.nome ?? null,
      pct: nvl.pct, faltam: nvl.faltam, metricaLabel, metricaValor,
    },
    medalhas: (medalhasRows || []) as any,
    missoes: missoesCompletas,
    streak: { dias: streak.dias, recorde: streak.recorde },
    comunidade, creditos, mesesGratis,
  }
}

/** Desconto na mensalidade conforme o nível do comerciante (métrica = pedidos). */
export function descontoMensalidade(pedidosRecebidos: number): number {
  const n = nivelDe(NIVEIS_COMERCIANTE, pedidosRecebidos).atual.nome
  return n === 'Diamante' ? 30 : n === 'Ouro' ? 20 : n === 'Prata' ? 10 : 0
}

/** Desconto no kit conforme o nível do entregador (métrica = entregas). */
export function descontoKit(entregas: number): number {
  const n = nivelDe(NIVEIS_ENTREGADOR, entregas).atual.nome
  return n === 'Diamante' ? 30 : n === 'Ouro' ? 20 : n === 'Prata' ? 10 : 0
}
