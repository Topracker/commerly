import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '../../../lib/supabase-admin'
import { isDelivery } from '../../../lib/pedidosClientes'
import { idsLojasOcultas, semOcultas } from '../../../lib/lojasOcultas'
import { MSG_PAUSA, moduloAtivo } from '../../../lib/featureFlags'

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

  // Chave `entregador` desligada: nenhuma loja NOVA para pedir parceria (+
  // aviso). Não pode ser lista vazia: o painel tira desta lista o nome, o
  // endereço e as coordenadas das lojas das corridas em andamento — esvaziar
  // quebraria quem está no meio de uma entrega. Ficam só as lojas com que ele
  // já tem corrida ativa ou parceria.
  if (!(await moduloAtivo('entregador', admin))) {
    const [{ data: ativos }, { data: parc }] = await Promise.all([
      admin.from('pedidos_clientes').select('loja_id')
        .eq('entregador_id', entregador.id).in('status', ['recebido', 'preparando', 'saiu']),
      admin.from('entregador_parcerias').select('loja_id').eq('entregador_id', entregador.id),
    ])
    const ids = [...new Set([...(ativos || []), ...(parc || [])].map(r => r.loja_id as string))]
    const { data: suas } = ids.length
      ? await admin.from('lojas_publicas').select('id, nome, tipo, localizacao, latitude, longitude').in('id', ids)
      : { data: [] }
    return NextResponse.json({ lojas: suas || [], aviso: MSG_PAUSA.entregador, modulo_pausado: 'entregador' })
  }

  const [{ data: todas, error }, ocultas] = await Promise.all([
    admin.from('lojas_publicas').select('id, nome, tipo, localizacao, latitude, longitude'),
    idsLojasOcultas(admin),
  ])
  const lojas = semOcultas(todas || [], ocultas, l => l.id)
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
