import type { SupabaseClient } from '@supabase/supabase-js'

// Upload da foto da fachada do comércio para o bucket público "lojas".
// Caminho fixo por loja: "{loja_id}/fachada.jpg" (upsert — troca a anterior).
// Valida tipo (JPG/PNG/WEBP) e tamanho (máx. 5MB) antes de subir.

export const FACHADA_MAX_BYTES = 5 * 1024 * 1024
export const FACHADA_TIPOS = ['image/jpeg', 'image/png', 'image/webp']

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

  // Nome fixo por loja para o link não mudar; cache-buster no retorno garante
  // que a nova imagem apareça mesmo com o mesmo path.
  const path = `${lojaId}/fachada.jpg`
  const { error: uploadError } = await supabase.storage
    .from('lojas')
    .upload(path, file, { upsert: true, contentType: file.type })
  if (uploadError) return { error: 'Não foi possível enviar a foto da fachada.' }

  const { data } = supabase.storage.from('lojas').getPublicUrl(path)
  return { url: `${data.publicUrl}?v=${Date.now()}` }
}
