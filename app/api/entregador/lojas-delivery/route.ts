import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '../../../lib/supabase-admin'
import { isDelivery } from '../../../lib/pedidosClientes'

// Lista as lojas de delivery para o entregador solicitar parceria.
//
// Por que via service role: a leitura pública das lojas deveria vir da view
// `lojas_publicas` (security definer), mas em produção ela está aplicando a RLS
// de `lojas` (owner-only) — anon e entregador enxergam 0 linhas. Aqui usamos o
// admin client (bypass de RLS) e devolvemos só campos públicos das lojas de
// nichos de delivery, filtrados pela mesma regra `isDelivery` do resto do app.
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
  const { data: entregador } = await admin
    .from('entregadores').select('id').eq('user_id', user.id).maybeSingle()
  if (!entregador) return NextResponse.json({ error: 'Perfil de entregador não encontrado' }, { status: 403 })

  const { data: lojas, error } = await admin
    .from('lojas_publicas').select('id, nome, tipo, localizacao, latitude, longitude')
  if (error) {
    console.error('[entregador/lojas-delivery] erro ao ler lojas:', error.message)
    return NextResponse.json({ error: 'Erro ao carregar lojas.' }, { status: 500 })
  }

  const delivery = (lojas || []).filter(l => isDelivery(l.tipo))
  console.log(
    `[entregador/lojas-delivery] ${lojas?.length ?? 0} lojas no total, ` +
    `${delivery.length} de delivery. tipos=${JSON.stringify((lojas || []).map(l => l.tipo))}`,
  )
  return NextResponse.json({ lojas: delivery })
}
