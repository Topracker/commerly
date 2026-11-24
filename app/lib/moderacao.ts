// Denunciar e bloquear (política de conteúdo gerado por usuários da Google Play).
//
// • Denúncia: vai por e-mail para a equipe (/api/denunciar), com quem denunciou,
//   o alvo e o motivo. A equipe avalia e age pelo painel admin.
// • Bloqueio: fica neste aparelho (localStorage) e esconde do usuário tudo o que
//   vem do bloqueado — posts e stories de uma loja, comentários de um cliente,
//   a conversa com aquela loja/cliente. Não exige mudança no banco.

export type TipoAlvo = 'post' | 'story' | 'comentario' | 'loja' | 'cliente' | 'mensagem'
export type TipoBloqueio = 'loja' | 'cliente'

export const MOTIVOS_DENUNCIA = [
  'Spam ou golpe',
  'Conteúdo ofensivo ou discurso de ódio',
  'Assédio ou ameaça',
  'Nudez ou conteúdo sexual',
  'Violência',
  'Produto ou serviço proibido',
  'Informação falsa',
  'Outro',
] as const

const CHAVE = 'commerly:bloqueados'
const EVENTO = 'commerly:bloqueados-mudou'

export type ItemBloqueado = { id: string; nome?: string | null }
type Lista = Record<TipoBloqueio, ItemBloqueado[]>

function normalizar(v: unknown): ItemBloqueado[] {
  if (!Array.isArray(v)) return []
  return v
    .map(x => (typeof x === 'string' ? { id: x } : x && typeof x === 'object' && typeof (x as ItemBloqueado).id === 'string' ? (x as ItemBloqueado) : null))
    .filter((x): x is ItemBloqueado => !!x)
}

function ler(): Lista {
  try {
    const bruto = JSON.parse(localStorage.getItem(CHAVE) || '{}')
    return { loja: normalizar(bruto.loja), cliente: normalizar(bruto.cliente) }
  } catch {
    return { loja: [], cliente: [] }
  }
}

function gravar(l: Lista) {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(l))
    window.dispatchEvent(new Event(EVENTO))
  } catch { /* sem storage: o bloqueio vale só nesta tela */ }
}

export function bloqueados(tipo: TipoBloqueio): Set<string> {
  if (typeof window === 'undefined') return new Set()
  return new Set(ler()[tipo].map(x => x.id))
}

export function listaBloqueados(): Lista {
  if (typeof window === 'undefined') return { loja: [], cliente: [] }
  return ler()
}

export function estaBloqueado(tipo: TipoBloqueio, id: string | null | undefined): boolean {
  return !!id && bloqueados(tipo).has(id)
}

export function bloquear(tipo: TipoBloqueio, id: string, nome?: string | null) {
  const l = ler()
  if (!l[tipo].some(x => x.id === id)) l[tipo].push({ id, nome: nome || null })
  gravar(l)
}

export function desbloquear(tipo: TipoBloqueio, id: string) {
  const l = ler()
  l[tipo] = l[tipo].filter(x => x.id !== id)
  gravar(l)
}

/** Avisa quando a lista de bloqueados muda (nesta ou em outra aba). */
export function aoMudarBloqueados(fn: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const onStorage = (e: StorageEvent) => { if (e.key === CHAVE) fn() }
  window.addEventListener(EVENTO, fn)
  window.addEventListener('storage', onStorage)
  return () => {
    window.removeEventListener(EVENTO, fn)
    window.removeEventListener('storage', onStorage)
  }
}

export async function denunciar(d: {
  tipo: TipoAlvo
  alvoId: string
  alvoNome?: string | null
  motivo: string
  detalhe?: string
  /** Trecho do conteúdo denunciado (texto do comentário/mensagem, legenda). */
  trecho?: string | null
}): Promise<{ ok: true } | { ok: false; erro: string }> {
  try {
    const res = await fetch('/api/denunciar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...d, pagina: typeof location !== 'undefined' ? location.pathname : '' }),
    })
    if (res.ok) return { ok: true }
    const j = await res.json().catch(() => ({}))
    return { ok: false, erro: j.erro || 'Não foi possível enviar a denúncia. Tente de novo.' }
  } catch {
    return { ok: false, erro: 'Sem conexão. Tente de novo.' }
  }
}
