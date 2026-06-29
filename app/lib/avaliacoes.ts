import type { SupabaseClient } from '@supabase/supabase-js'

export type Rating = { media: number; total: number }

// Busca as avaliações em avaliacoes_lojas e devolve média + total por loja_id.
// Sem lojaIds, agrega todas as lojas (usado no ranking). Com lojaIds, restringe
// à lista informada (usado na busca, para não puxar avaliações de tudo).
export async function getRatingsPorLoja(
  supabase: SupabaseClient,
  lojaIds?: string[],
): Promise<Record<string, Rating>> {
  if (lojaIds && lojaIds.length === 0) return {}

  let query = supabase.from('avaliacoes_lojas').select('loja_id, nota')
  if (lojaIds) query = query.in('loja_id', lojaIds)

  const { data, error } = await query
  if (error) { console.error('[avaliacoes] getRatingsPorLoja error:', error); return {} }

  const acc: Record<string, { soma: number; total: number }> = {}
  for (const a of data || []) {
    const cur = acc[a.loja_id] ?? { soma: 0, total: 0 }
    cur.soma += a.nota
    cur.total += 1
    acc[a.loja_id] = cur
  }

  const out: Record<string, Rating> = {}
  for (const id in acc) {
    out[id] = { media: acc[id].soma / acc[id].total, total: acc[id].total }
  }
  return out
}
