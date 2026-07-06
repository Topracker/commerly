import type { SupabaseClient } from '@supabase/supabase-js'

export type Rating = { media: number; total: number }

/**
 * Sobe uma foto de avaliação (cliente) ou comprovante de entrega (entregador)
 * pro bucket público "avaliacoes" e devolve a URL pública. `pasta` separa o
 * caminho por autor (id do cliente/entregador) e finalidade.
 */
export async function uploadFotoAvaliacao(
  supabase: SupabaseClient,
  pasta: string,
  file: File,
): Promise<{ url: string } | { error: string }> {
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
  const path = `${pasta}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const { error } = await supabase.storage.from('avaliacoes').upload(path, file, {
    cacheControl: '3600',
    upsert: true,
    contentType: file.type || 'image/jpeg',
  })
  if (error) return { error: 'Não foi possível enviar a foto. Tente novamente.' }
  const { data } = supabase.storage.from('avaliacoes').getPublicUrl(path)
  return { url: data.publicUrl }
}

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
