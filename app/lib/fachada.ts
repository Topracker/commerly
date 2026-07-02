import type { SupabaseClient } from '@supabase/supabase-js'

// Fotos da fachada do comércio no bucket público "lojas".
// Cada foto tem nome único ("{loja_id}/{timestamp}-{rand}.{ext}") para permitir
// múltiplas fotos por loja e remoção individual sem colisão de nome.
// As URLs públicas ficam guardadas no array `lojas.fotos_fachada`.

export const FACHADA_MAX_BYTES = 5 * 1024 * 1024
export const FACHADA_TIPOS = ['image/jpeg', 'image/png', 'image/webp']
export const FACHADA_MAX_FOTOS = 3

const EXT_POR_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

export function validarFachada(file: File): string | null {
  if (!FACHADA_TIPOS.includes(file.type)) return 'Use uma imagem JPG, PNG ou WEBP.'
  if (file.size > FACHADA_MAX_BYTES) return 'A imagem deve ter no máximo 5MB.'
  return null
}

export async function uploadFachada(
  supabase: SupabaseClient,
  lojaId: string,
  file: File,
): Promise<{ url: string } | { error: string }> {
  const erro = validarFachada(file)
  if (erro) return { error: erro }

  const ext = EXT_POR_MIME[file.type]
  if (!ext) return { error: 'Formato de imagem inválido.' }

  const path = `${lojaId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const { error: uploadError } = await supabase.storage
    .from('lojas')
    .upload(path, file, { contentType: file.type })
  if (uploadError) return { error: 'Não foi possível enviar a foto da fachada.' }

  const { data } = supabase.storage.from('lojas').getPublicUrl(path)
  return { url: data.publicUrl }
}

// Extrai o caminho dentro do bucket a partir da URL pública, para poder apagar.
export function pathFachada(url: string): string | null {
  const semQuery = url.split('?')[0]
  const marcador = '/lojas/'
  const i = semQuery.indexOf(marcador)
  if (i === -1) return null
  return semQuery.slice(i + marcador.length)
}

export async function removerFachada(supabase: SupabaseClient, url: string): Promise<void> {
  const path = pathFachada(url)
  if (path) await supabase.storage.from('lojas').remove([path])
}
