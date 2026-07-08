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
  // Despacho estilo Uber (sql/2026-07-08-despacho-corridas.sql). Online = entra
  // no pool; posição corrente usada para achar o entregador mais próximo da loja.
  disponivel?: boolean
  latitude?: number | null
  longitude?: number | null
  localizacao_at?: string | null
  created_at: string
}

// ===========================================================================
// DESPACHO DE CORRIDAS (pool de entregadores estilo iFood/Uber)
// ===========================================================================

/** Raio de busca de entregadores a partir da loja (km). */
export const RAIO_BUSCA_KM = 5
/** Tempo que o entregador tem para aceitar/recusar uma oferta (segundos). */
export const TEMPO_RESPOSTA_CORRIDA_S = 30
/** Idade máxima da posição do entregador para ele ainda contar como "online" (ms). */
export const FRESCOR_LOCALIZACAO_MS = 5 * 60_000
/** Intervalo com que o app do entregador grava a posição no banco enquanto online (ms). */
export const LOCALIZACAO_PING_MS = 15_000
/** Sem atualizar o GPS por este tempo (saiu para entrega) => reentrega automática. */
export const GPS_INATIVIDADE_MS = 10 * 60_000

export type StatusOferta = 'pendente' | 'aceita' | 'recusada' | 'expirada'

export type OfertaCorrida = {
  id: string
  pedido_id: string
  entregador_id: string
  loja_id: string
  status: StatusOferta
  distancia_km: number | null
  expira_em: string
  created_at: string
  updated_at: string
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

// ===========================================================================
// GAMIFICAÇÃO
// ===========================================================================

/** Meta semanal de entregas que dá bônus. */
export const META_SEMANAL_ENTREGAS = 10

export type Badge = {
  id: string
  emoji: string
  titulo: string
  descricao: string
  conquistada: boolean
}

/**
 * Badges do entregador, derivadas do total de entregas concluídas, da nota
 * média e das avaliações 5★ recebidas. Retorna todas (conquistadas ou não)
 * para o perfil poder mostrar o progresso.
 */
export function badgesEntregador(stats: {
  entregas: number
  mediaNota: number
  totalAvaliacoes: number
  cincoEstrelas: number
}): Badge[] {
  const { entregas, mediaNota, totalAvaliacoes, cincoEstrelas } = stats
  return [
    { id: 'primeira',  emoji: '🚀', titulo: 'Primeira entrega', descricao: 'Complete sua 1ª entrega',          conquistada: entregas >= 1 },
    { id: 'dez',       emoji: '🔟', titulo: '10 entregas',       descricao: 'Complete 10 entregas',              conquistada: entregas >= 10 },
    { id: 'cinquenta', emoji: '🏅', titulo: '50 entregas',       descricao: 'Complete 50 entregas',              conquistada: entregas >= 50 },
    { id: 'cem',       emoji: '💯', titulo: '100 entregas',      descricao: 'Complete 100 entregas',             conquistada: entregas >= 100 },
    { id: 'cinco_est', emoji: '⭐', titulo: 'Nota 5 estrelas',   descricao: 'Receba uma avaliação 5★',           conquistada: cincoEstrelas >= 1 },
    { id: 'querido',   emoji: '❤️', titulo: 'Queridinho',        descricao: 'Média 4,8★ com 10+ avaliações',      conquistada: totalAvaliacoes >= 10 && mediaNota >= 4.8 },
  ]
}

export type RankingEntregador = {
  entregador_id: string
  nome: string
  foto_url: string | null
  entregas: number
  ganhos: number
  media_nota: number
}

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
