import type { SupabaseClient } from '@supabase/supabase-js'

// Lojas de TESTE fora das listagens públicas (coluna `lojas.oculta`, exposta em
// `lojas_publicas`). Só as LISTAGENS filtram — busca, mapa, sitemap, ranking,
// feed, fundadores, Vision, lista do entregador. Link direto (/loja/[id],
// /cliente/loja/[id], /cardapio/[id]) continua abrindo, para o fluxo seguir
// testável em produção com as contas de teste.
//
// Tolerante à ordem do deploy: antes de sql/2026-10-25-lojas-oculta-vitrine.sql
// a coluna não existe, a consulta dá erro e o conjunto volta vazio (nada fica
// oculto, nada quebra). Por isso o filtro é feito aqui, em JS, e nunca como
// `.eq('oculta', false)` na query da listagem — que derrubaria a vitrine com
// um 400 enquanto a migração não estiver aplicada.
export async function idsLojasOcultas(client: SupabaseClient): Promise<Set<string>> {
  const { data, error } = await client.from('lojas_publicas').select('id').eq('oculta', true)
  if (error || !data) return new Set()
  return new Set((data as { id: string }[]).map(l => l.id))
}

/** Tira das listas as lojas ocultas (`chave` aponta para o id da loja). */
export function semOcultas<T>(lista: T[], ocultas: Set<string>, chave: (x: T) => string | null | undefined): T[] {
  return ocultas.size ? lista.filter(x => !ocultas.has(chave(x) ?? '')) : lista
}
