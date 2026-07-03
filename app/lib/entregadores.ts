// Domínio dos entregadores (delivery).
// A área /entregador-delivery é uma conta própria, distinta de loja/cliente/fornecedor.

export type Entregador = {
  id: string
  user_id: string
  nome: string
  cpf: string
  telefone: string | null
  foto_url: string | null
  stripe_account_id: string | null
  stripe_onboarded: boolean
  created_at: string
}

export type StatusParceria = 'pendente' | 'aceita' | 'recusada'

export type ParceriaEntregador = {
  id: string
  entregador_id: string
  loja_id: string
  status: StatusParceria
  created_at: string
  updated_at: string
}

export type LocalizacaoEntrega = {
  pedido_id: string
  entregador_id: string
  latitude: number
  longitude: number
  updated_at: string
}

export const STATUS_PARCERIA_META: Record<StatusParceria, { label: string; classes: string }> = {
  pendente: { label: 'Aguardando', classes: 'bg-amber-500/15 text-amber-300 border-amber-500/40' },
  aceita:   { label: 'Parceira',   classes: 'bg-green-500/15 text-green-300 border-green-500/40' },
  recusada: { label: 'Recusada',   classes: 'bg-red-500/15 text-red-400 border-red-500/40' },
}

/** Intervalo de atualização do GPS (ms) — enunciado: a cada 10 segundos. */
export const GPS_INTERVALO_MS = 10_000

/** Sobe a foto do entregador pro bucket "entregadores" e devolve a URL pública. */
export async function uploadFotoEntregador(
  supabase: any,
  entregadorUserId: string,
  file: File,
): Promise<{ url: string } | { error: string }> {
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
  const path = `${entregadorUserId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const { error } = await supabase.storage.from('entregadores').upload(path, file, {
    cacheControl: '3600',
    upsert: true,
    contentType: file.type || 'image/jpeg',
  })
  if (error) return { error: 'Não foi possível enviar a foto. Tente novamente.' }
  const { data } = supabase.storage.from('entregadores').getPublicUrl(path)
  return { url: data.publicUrl }
}
