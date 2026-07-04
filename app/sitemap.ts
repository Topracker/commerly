import type { MetadataRoute } from 'next'
import { createAdminClient } from './lib/supabase-admin'
import { SITE_URL } from './lib/site'

// Regenera o sitemap no máximo a cada hora (novas lojas entram sem novo deploy).
export const revalidate = 3600

// Sitemap: páginas estáticas públicas + uma entrada por loja pública.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const estaticas: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE_URL}/login`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE_URL}/cliente/login`, changeFrequency: 'yearly', priority: 0.3 },
  ]

  // Páginas de loja pública. Tolerante: se o Supabase não estiver configurado
  // (build/preview), devolve só as estáticas em vez de quebrar.
  let lojas: MetadataRoute.Sitemap = []
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('lojas_publicas')
      .select('id, created_at')
      .order('created_at', { ascending: false })
      .limit(5000)
    lojas = (data || []).map((l: { id: string; created_at: string | null }) => ({
      url: `${SITE_URL}/loja/${l.id}`,
      lastModified: l.created_at ? new Date(l.created_at) : undefined,
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    }))
  } catch {
    // silencioso — mantém o sitemap com as páginas estáticas
  }

  return [...estaticas, ...lojas]
}
