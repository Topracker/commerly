import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * SEMPRE leia avaliações por estas views, nunca pelas tabelas.
 *
 * As tabelas são um log append-only (ver lib/integridade.ts): editar uma
 * avaliação insere uma linha nova que substitui a antiga, e a antiga fica lá
 * para a cadeia de hash continuar fechando. Ler a tabela crua contaria a mesma
 * avaliação duas vezes na média.
 */
export const VIEW_AVAL_LOJAS = 'avaliacoes_lojas_atuais'
export const VIEW_AVAL_ENTREGADORES = 'avaliacoes_entregadores_atuais'

export type Rating = { media: number; total: number }

export type EnvioAvaliacao = {
  alvo: 'loja' | 'entregador'
  alvo_id: string
  nota: number
  comentario?: string | null
  foto_url?: string | null
  pedido_id?: string | null
  /** id da avaliação sendo editada; a nova linha a substitui. */
  substitui_id?: string | null
}

/**
 * Grava uma avaliação via /api/avaliacoes. O cliente não escreve direto na
 * tabela: só o servidor tem o segredo do HMAC que sela a avaliação.
 */
export async function enviarAvaliacao(env: EnvioAvaliacao): Promise<{ id: string; hash: string } | { error: string }> {
  let res: Response
  try {
    res = await fetch('/api/avaliacoes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(env),
    })
  } catch {
    return { error: 'Sem conexão. Tente novamente.' }
  }

  const json = await res.json().catch(() => ({}))
  if (!res.ok) return { error: json?.erro ?? 'Erro ao enviar avaliação.' }
  return { id: json.id, hash: json.hash }
}

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
  // Sem `upsert`: ele exige SELECT em storage.objects (INSERT ... ON CONFLICT)
  // e nenhum bucket tem policy de SELECT — o upload voltava 403. O path já é
  // único (Date.now + sufixo aleatório).
  const { error } = await supabase.storage.from('avaliacoes').upload(path, file, {
    cacheControl: '3600',
    contentType: file.type || 'image/jpeg',
  })
  if (error) return { error: 'Não foi possível enviar a foto. Tente novamente.' }
  const { data } = supabase.storage.from('avaliacoes').getPublicUrl(path)
  return { url: data.publicUrl }
}

// Busca as avaliações atuais e devolve média + total por loja_id.
// Sem lojaIds, agrega todas as lojas (usado no ranking). Com lojaIds, restringe
// à lista informada (usado na busca, para não puxar avaliações de tudo).
export async function getRatingsPorLoja(
  supabase: SupabaseClient,
  lojaIds?: string[],
): Promise<Record<string, Rating>> {
  if (lojaIds && lojaIds.length === 0) return {}

  let query = supabase.from(VIEW_AVAL_LOJAS).select('loja_id, nota')
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
