// Lojas favoritas do cliente — persistidas em localStorage por enquanto.
// TODO: migrar para uma tabela `clientes_favoritos` no Supabase quando houver
// service role / DDL disponível, vinculando por cliente_id + loja_id.

export type LojaFavorita = { id: string; nome: string; tipo?: string }

const KEY = 'commerly_lojas_favoritas'

export function getFavoritos(): LojaFavorita[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function isFavorito(id: string): boolean {
  return getFavoritos().some(l => l.id === id)
}

/** Alterna o favorito e retorna o novo estado (true = agora é favorito). */
export function toggleFavorito(loja: LojaFavorita): boolean {
  const atuais = getFavoritos()
  const existe = atuais.some(l => l.id === loja.id)
  const novos = existe
    ? atuais.filter(l => l.id !== loja.id)
    : [...atuais, { id: loja.id, nome: loja.nome, tipo: loja.tipo }]
  localStorage.setItem(KEY, JSON.stringify(novos))
  return !existe
}

export function removeFavorito(id: string): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(KEY, JSON.stringify(getFavoritos().filter(l => l.id !== id)))
}
