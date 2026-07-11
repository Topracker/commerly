import { createAdminClient } from './supabase-admin'
import { NIVEIS_COMERCIANTE, NIVEIS_ENTREGADOR, NIVEIS_CLIENTE, nivelDe } from './crescimento'

export type Papel = 'comerciante' | 'entregador' | 'cliente'

export type PerfilPublico = {
  papel: Papel
  privado?: boolean
  nome: string
  foto: string | null
  cidade: string | null
  desde: string
  metricaLabel: string
  metricaValor: number
  nivel: { nome: string; emoji: string; cor: string }
  aval: { media: number; total: number }
  medalhas: string[]
  streak: { dias: number; recorde: number; ultimo_dia: string | null } | null
  produtos?: { nome: string; preco: number | null; imagem: string | null }[]
  websiteUrl?: string | null
  lojaId?: string
}

async function medalhasDe(admin: ReturnType<typeof createAdminClient>, userId: string): Promise<string[]> {
  const { data } = await admin.from('medalhas_usuarios').select('slug').eq('user_id', userId).order('concedida_em', { ascending: true })
  return (data || []).map((m: any) => m.slug)
}
async function streakDe(admin: ReturnType<typeof createAdminClient>, userId: string) {
  const { data } = await admin.from('streaks').select('dias, recorde, ultimo_dia').eq('user_id', userId).maybeSingle()
  return data ? { dias: data.dias || 0, recorde: data.recorde || 0, ultimo_dia: data.ultimo_dia } : null
}

export async function carregarPerfil(papel: Papel, id: string): Promise<PerfilPublico | null> {
  const admin = createAdminClient()

  if (papel === 'comerciante') {
    const { data: loja } = await admin.from('lojas')
      .select('id, user_id, nome, tipo, localizacao, foto_fachada_url, website_url, created_at').eq('id', id).maybeSingle()
    if (!loja) return null
    const [{ count: pedidos }, { data: avals }, medalhas, streak, { data: produtos }] = await Promise.all([
      admin.from('pedidos_clientes').select('id', { count: 'exact', head: true }).eq('loja_id', loja.id).neq('status', 'cancelado'),
      admin.from('avaliacoes_lojas_atuais').select('nota').eq('loja_id', loja.id),
      medalhasDe(admin, loja.user_id),
      streakDe(admin, loja.user_id),
      admin.from('produtos').select('nome, preco_venda, imagem_url').eq('loja_id', loja.id).limit(8),
    ])
    const notas = (avals || []).map((a: any) => Number(a.nota)).filter((n: number) => n > 0)
    const nvl = nivelDe(NIVEIS_COMERCIANTE, pedidos || 0).atual
    return {
      papel, nome: loja.nome, foto: loja.foto_fachada_url, cidade: loja.localizacao, desde: loja.created_at,
      metricaLabel: 'pedidos', metricaValor: pedidos || 0,
      nivel: { nome: nvl.nome, emoji: nvl.emoji, cor: nvl.cor },
      aval: { media: notas.length ? notas.reduce((s, n) => s + n, 0) / notas.length : 0, total: notas.length },
      medalhas, streak,
      produtos: (produtos || []).map((p: any) => ({ nome: p.nome, preco: p.preco_venda, imagem: p.imagem_url })),
      websiteUrl: loja.website_url, lojaId: loja.id,
    }
  }

  if (papel === 'entregador') {
    const { data: ent } = await admin.from('entregadores')
      .select('id, user_id, nome, foto_url, created_at').eq('id', id).maybeSingle()
    if (!ent) return null
    const [{ count: entregas }, { data: avals }, medalhas, streak] = await Promise.all([
      admin.from('pedidos_clientes').select('id', { count: 'exact', head: true }).eq('entregador_id', ent.id).eq('status', 'entregue'),
      admin.from('avaliacoes_entregadores_atuais').select('nota').eq('entregador_id', ent.id),
      medalhasDe(admin, ent.user_id),
      streakDe(admin, ent.user_id),
    ])
    const notas = (avals || []).map((a: any) => Number(a.nota)).filter((n: number) => n > 0)
    const nvl = nivelDe(NIVEIS_ENTREGADOR, entregas || 0).atual
    return {
      papel, nome: ent.nome, foto: ent.foto_url, cidade: null, desde: ent.created_at,
      metricaLabel: 'entregas', metricaValor: entregas || 0,
      nivel: { nome: nvl.nome, emoji: nvl.emoji, cor: nvl.cor },
      aval: { media: notas.length ? notas.reduce((s, n) => s + n, 0) / notas.length : 0, total: notas.length },
      medalhas, streak,
    }
  }

  // cliente
  const { data: cli } = await admin.from('clientes')
    .select('id, user_id, nome, perfil_privado, created_at').eq('id', id).maybeSingle()
  if (!cli) return null
  const medalhas = await medalhasDe(admin, cli.user_id)
  const streak = await streakDe(admin, cli.user_id)
  const { count: pedidos } = await admin.from('pedidos_clientes').select('id', { count: 'exact', head: true }).eq('cliente_id', cli.id).neq('status', 'cancelado')
  const nvl = nivelDe(NIVEIS_CLIENTE, pedidos || 0).atual
  return {
    papel, privado: !!cli.perfil_privado,
    nome: cli.perfil_privado ? (cli.nome?.split(' ')[0] || 'Cliente') : cli.nome,
    foto: null, cidade: null, desde: cli.created_at,
    metricaLabel: 'pedidos', metricaValor: cli.perfil_privado ? 0 : (pedidos || 0),
    nivel: { nome: nvl.nome, emoji: nvl.emoji, cor: nvl.cor },
    aval: { media: 0, total: 0 },
    medalhas: cli.perfil_privado ? [] : medalhas,
    streak: cli.perfil_privado ? null : streak,
  }
}

/** Tempo na plataforma, legível. */
export function tempoNaPlataforma(desde: string): string {
  const dias = Math.max(0, Math.floor((Date.now() - new Date(desde).getTime()) / 86400000))
  if (dias < 30) return `${dias} dia${dias === 1 ? '' : 's'}`
  const meses = Math.floor(dias / 30)
  if (meses < 12) return `${meses} mês${meses === 1 ? '' : 'es'}`
  const anos = Math.floor(meses / 12)
  return `${anos} ano${anos === 1 ? '' : 's'}`
}
