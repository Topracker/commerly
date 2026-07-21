import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '../../../lib/supabase-admin'

// Lista/detalha as lojas públicas para o cliente (marketplace).
//
// Por que via service role: a view `lojas_publicas` deveria ser security
// definer, mas em produção está aplicando a RLS owner-only de `lojas` — anon e
// authenticated enxergam 0 linhas. Aqui usamos o admin client (bypass de RLS) e
// devolvemos só os campos públicos da view. Enquanto o SQL
// 2026-07-03-lojas-publicas-fix.sql não é aplicado, esta rota mantém o
// marketplace funcionando.
//
//   GET /api/cliente/lojas            -> lista (com filtros ?tipo= e ?busca=)
//   GET /api/cliente/lojas?id=<uuid>  -> detalhe de uma loja
const COLS =
  'id, nome, tipo, localizacao, telefone, instagram, horario, latitude, longitude, fotos_fachada, taxa_entrega, created_at, destaque'

/**
 * O delivery está mesmo aberto nesta loja? Duas chaves independentes, ambas
 * precisam estar ligadas — e a resposta viaja junto com a loja para que o app
 * do cliente esconda o botão "Fazer Pedido" em vez de deixá-lo tomar um erro
 * do trigger só depois de montar o carrinho.
 *
 *   1. `lojas.delivery_ativo`  -> o comerciante pausou os pedidos
 *   2. feature flag `delivery` -> global, com override da CIDADE da loja
 */
async function deliveryLiberado(admin: any, lojaIds: string[]): Promise<Map<string, boolean>> {
  const mapa = new Map<string, boolean>()
  if (lojaIds.length === 0) return mapa

  const { data: linhas } = await admin
    .from('lojas').select('id, cidade_slug, delivery_ativo').in('id', lojaIds)
  const lojas = (linhas || []) as { id: string; cidade_slug: string | null; delivery_ativo: boolean | null }[]

  const cidades = [...new Set(lojas.map(l => l.cidade_slug).filter(Boolean))] as string[]
  const { data: flags } = await admin
    .from('feature_flags').select('cidade_slug, ativo')
    .eq('flag', 'delivery').in('cidade_slug', ['__global__', ...cidades])

  const porCidade = new Map((flags || []).map((f: any) => [f.cidade_slug as string, !!f.ativo]))
  const global = porCidade.has('__global__') ? porCidade.get('__global__')! : true

  for (const l of lojas) {
    const daCidade = l.cidade_slug != null && porCidade.has(l.cidade_slug)
      ? porCidade.get(l.cidade_slug)!
      : global
    mapa.set(l.id, l.delivery_ativo !== false && daCidade === true)
  }
  return mapa
}

export async function GET(request: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } },
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const admin = createAdminClient()
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  // Detalhe de uma loja.
  if (id) {
    const { data, error } = await admin.from('lojas_publicas').select(COLS).eq('id', id).maybeSingle()
    if (error) {
      console.error('[cliente/lojas] erro ao ler loja:', error.message)
      return NextResponse.json({ error: 'Erro ao carregar a loja.' }, { status: 500 })
    }
    if (!data) return NextResponse.json({ loja: null }, { status: 404 })
    const liberado = await deliveryLiberado(admin, [data.id])
    return NextResponse.json({ loja: { ...data, delivery_liberado: liberado.get(data.id) !== false } })
  }

  // Lista com filtros opcionais.
  let query = admin.from('lojas_publicas').select(COLS).order('nome', { ascending: true }).limit(50)
  const tipo = searchParams.get('tipo')
  const busca = searchParams.get('busca')
  if (tipo && tipo !== 'Todos') query = query.eq('tipo', tipo)
  if (busca && busca.trim()) query = query.ilike('nome', `%${busca.trim()}%`)

  const { data, error } = await query
  if (error) {
    console.error('[cliente/lojas] erro ao listar lojas:', error.message)
    return NextResponse.json({ error: 'Erro ao carregar as lojas.' }, { status: 500 })
  }
  console.log(`[cliente/lojas] ${data?.length ?? 0} lojas (tipo=${tipo || 'Todos'}, busca=${busca || ''})`)
  const liberado = await deliveryLiberado(admin, (data || []).map((l: any) => l.id))
  return NextResponse.json({
    lojas: (data || []).map((l: any) => ({ ...l, delivery_liberado: liberado.get(l.id) !== false })),
  })
}
