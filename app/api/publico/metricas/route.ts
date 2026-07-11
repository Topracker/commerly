import { NextResponse } from 'next/server'
import { createAdminClient } from '../../../lib/supabase-admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Métricas públicas para a homepage e páginas de marketing: contadores ao vivo,
// feed de conquistas, ranking de cidades. Sem auth (service role, só leitura de
// contagens e dados públicos).
export async function GET() {
  const admin = createAdminClient()
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0)

  const cont = async (tabela: string, mod?: (q: any) => any): Promise<number> => {
    try {
      let q: any = admin.from(tabela).select('id', { count: 'exact', head: true })
      if (mod) q = mod(q)
      const { count } = await q
      return count || 0
    } catch { return 0 }
  }

  const [comerciantes, clientes, entregadores, pedidos, pedidosHoje, cidadesAtivas, feedRes, cidadesRes] =
    await Promise.all([
      cont('lojas'),
      cont('clientes'),
      cont('entregadores'),
      cont('pedidos_clientes'),
      cont('pedidos_clientes', (q: any) => q.gte('created_at', hoje.toISOString())),
      cont('cidades_expansao', (q: any) => q.eq('status', 'ativa')),
      admin.from('feed_conquistas').select('id, tipo, texto, cidade, created_at').order('created_at', { ascending: false }).limit(12),
      admin.from('cidades_expansao').select('nome, uf, slug, pontos, meta_pontos, status').order('pontos', { ascending: false }).limit(10),
    ])

  return NextResponse.json({
    contadores: { comerciantes, clientes, entregadores, pedidos, pedidos_hoje: pedidosHoje, cidades: cidadesAtivas },
    feed: feedRes.data || [],
    cidades: cidadesRes.data || [],
  }, { headers: { 'Cache-Control': 'public, max-age=30, s-maxage=30' } })
}
