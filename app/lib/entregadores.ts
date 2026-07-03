// Domínio dos entregadores (delivery).
// A área /entregador-delivery é uma conta própria, distinta de loja/cliente/fornecedor.

export type TipoVeiculo = 'moto' | 'carro' | 'bicicleta' | 'a_pe'

export const VEICULOS: { valor: TipoVeiculo; label: string; emoji: string }[] = [
  { valor: 'moto', label: 'Moto', emoji: '🏍️' },
  { valor: 'carro', label: 'Carro', emoji: '🚗' },
  { valor: 'bicicleta', label: 'Bicicleta', emoji: '🚲' },
  { valor: 'a_pe', label: 'A pé', emoji: '🚶' },
]

// Categorias de CNH (habilitação). A/AB cobrem moto; B/AB cobrem carro.
export const CATEGORIAS_CNH = ['A', 'B', 'AB', 'C', 'D', 'E', 'AC', 'AD', 'AE']

/** Veículos motorizados exigem CNH. */
export function exigeCNH(v?: TipoVeiculo | '' | null): boolean {
  return v === 'moto' || v === 'carro'
}

/** Idade em anos completos a partir de uma data ISO (YYYY-MM-DD). */
export function idadeEmAnos(dataISO: string): number {
  if (!dataISO) return NaN
  const hoje = new Date()
  const n = new Date(dataISO + 'T00:00:00')
  let anos = hoje.getFullYear() - n.getFullYear()
  const m = hoje.getMonth() - n.getMonth()
  if (m < 0 || (m === 0 && hoje.getDate() < n.getDate())) anos--
  return anos
}

export type Entregador = {
  id: string
  user_id: string
  nome: string
  cpf: string
  telefone: string | null
  foto_url: string | null
  data_nascimento: string | null
  documento_tipo: 'RG' | 'CNH' | null
  documento_numero: string | null
  documento_foto_url: string | null
  veiculo_tipo: TipoVeiculo | null
  cnh_numero: string | null
  cnh_categoria: string | null
  cnh_foto_url: string | null
  stripe_account_id: string | null
  stripe_onboarded: boolean
  // Fallback quando o Stripe Connect não pôde ser configurado: comerciante paga
  // a corrida manualmente. Opcional pois a coluna pode não existir ainda.
  pagamento_manual?: boolean
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

/**
 * Sobe uma foto do entregador (rosto, documento ou CNH) pro bucket
 * "entregadores" e devolve a URL pública. `categoria` organiza o caminho.
 */
export async function uploadFotoEntregador(
  supabase: any,
  entregadorUserId: string,
  file: File,
  categoria: 'rosto' | 'documento' | 'cnh' = 'rosto',
): Promise<{ url: string } | { error: string }> {
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
  const path = `${entregadorUserId}/${categoria}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const { error } = await supabase.storage.from('entregadores').upload(path, file, {
    cacheControl: '3600',
    upsert: true,
    contentType: file.type || 'image/jpeg',
  })
  if (error) return { error: 'Não foi possível enviar a foto. Tente novamente.' }
  const { data } = supabase.storage.from('entregadores').getPublicUrl(path)
  return { url: data.publicUrl }
}
