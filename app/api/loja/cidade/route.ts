// Em que cidade a LOJA está — e o que isso significa para ela receber pedidos.
//
//   GET  /api/loja/cidade   → estado atual (alimenta o aviso do dashboard)
//   POST /api/loja/cidade   → resolve pelo endereço/coords e GRAVA cidade_slug
//
// Por que existe: com `lojas.cidade_slug` nulo, o gating de `delivery` cai só
// no escopo `__global__` — hoje OFF — e a loja não recebe pedido nenhum. Antes
// disso o comerciante não tinha como saber; o dashboard agora avisa e este
// endpoint é o que conserta.
//
// A gravação usa o service role de propósito: `cidade_slug` é infraestrutura de
// cobertura, não um campo que o comerciante digita — ele não escolhe em que
// cidade sua loja "está" para destravar o delivery.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '../../../lib/supabase-admin'
import { supabaseDaRota, usuarioDaRota } from '../../../lib/rotaSupabase'
import { flagAtiva } from '../../../lib/featureFlags'
import { resolverLocal, nomeDoSlug, slugify } from '../../../lib/cidade'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 20

type Estado = 'sem_cidade' | 'sem_delivery' | 'liberada'

type Resposta = {
  estado: Estado
  slug: string | null
  cidade: string | null
  uf: string | null
}

/** Nome bonito da cidade: o de `cidades_expansao` (com acento) ou o do slug. */
async function nomeDaCidade(admin: ReturnType<typeof createAdminClient>, slug: string, uf: string | null) {
  const { data } = await admin
    .from('cidades_expansao').select('nome, uf').eq('slug', slug).maybeSingle()
  return { nome: data?.nome || nomeDoSlug(slug), uf: uf || (data?.uf as string | null) || null }
}

/** Situação da loja a partir do slug já gravado. */
async function situacao(
  admin: ReturnType<typeof createAdminClient>,
  slug: string | null,
  uf: string | null,
): Promise<Resposta> {
  if (!slug) return { estado: 'sem_cidade', slug: null, cidade: null, uf: null }
  const [{ nome, uf: ufFinal }, liberado] = await Promise.all([
    nomeDaCidade(admin, slug, uf),
    flagAtiva('delivery', slug, admin),
  ])
  return { estado: liberado ? 'liberada' : 'sem_delivery', slug, cidade: nome, uf: ufFinal }
}

async function lojaDaSessao() {
  const supabase = await supabaseDaRota()
  const user = await usuarioDaRota(supabase).catch(() => null)
  if (!user) return null
  const admin = createAdminClient()
  const { data } = await admin
    .from('lojas').select('id, cidade_slug, uf, localizacao, latitude, longitude')
    .eq('user_id', user.id).maybeSingle()
  return data ? { admin, loja: data } : null
}

export async function GET() {
  const ctx = await lojaDaSessao()
  if (!ctx) return NextResponse.json({ erro: 'Não autenticado.' }, { status: 401 })
  const { admin, loja } = ctx
  return NextResponse.json(await situacao(admin, loja.cidade_slug ?? null, loja.uf ?? null))
}

export async function POST(req: NextRequest) {
  const ctx = await lojaDaSessao()
  if (!ctx) return NextResponse.json({ erro: 'Não autenticado.' }, { status: 401 })
  const { admin, loja } = ctx

  // O corpo é opcional: quem acabou de salvar o endereço manda o que gravou
  // (evita depender da leitura chegar depois do UPDATE); sem corpo, usamos o
  // que está no banco.
  const body = await req.json().catch(() => ({} as Record<string, unknown>))
  const localizacao = typeof body.localizacao === 'string' ? body.localizacao : loja.localizacao
  const latitude = typeof body.latitude === 'number' ? body.latitude : loja.latitude
  const longitude = typeof body.longitude === 'number' ? body.longitude : loja.longitude

  const local = await resolverLocal({ localizacao, latitude, longitude })

  if (!local) {
    // Não resolveu: mantemos o que já estava (provedor fora do ar não pode
    // apagar a cidade de uma loja que já vendia) e reportamos a situação atual.
    console.warn('[loja/cidade] não resolveu a cidade da loja', loja.id, JSON.stringify({ localizacao, latitude, longitude }))
    return NextResponse.json(await situacao(admin, loja.cidade_slug ?? null, loja.uf ?? null))
  }

  const slug = slugify(local.cidade)
  if (!slug) return NextResponse.json(await situacao(admin, loja.cidade_slug ?? null, loja.uf ?? null))

  if (slug !== loja.cidade_slug || (local.uf && local.uf !== loja.uf)) {
    const { error } = await admin
      .from('lojas').update({ cidade_slug: slug, uf: local.uf ?? loja.uf ?? null }).eq('id', loja.id)
    if (error) {
      console.error('[loja/cidade] falha ao gravar cidade_slug:', error.message)
      return NextResponse.json({ erro: 'Não foi possível salvar a cidade da loja.' }, { status: 500 })
    }
  }

  return NextResponse.json(await situacao(admin, slug, local.uf ?? loja.uf ?? null))
}
