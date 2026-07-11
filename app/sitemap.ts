import type { MetadataRoute } from 'next'
import { createAdminClient } from './lib/supabase-admin'
import { SITE_URL } from './lib/site'
import { ARTIGOS } from './lib/blog'

// Regenera o sitemap no máximo a cada hora (novas lojas entram sem novo deploy).
export const revalidate = 3600

// Sitemap: páginas estáticas públicas + uma entrada por loja pública.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const estaticas: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE_URL}/sobre`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${SITE_URL}/suporte`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${SITE_URL}/termos`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE_URL}/privacidade`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE_URL}/login`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE_URL}/cliente/login`, changeFrequency: 'yearly', priority: 0.3 },
    // Marketing / comunidade / SEO
    { url: `${SITE_URL}/para-comerciantes`, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${SITE_URL}/para-entregadores`, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${SITE_URL}/para-clientes`, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${SITE_URL}/expansao`, changeFrequency: 'daily', priority: 0.7 },
    { url: `${SITE_URL}/fundadores`, changeFrequency: 'weekly', priority: 0.6 },
    { url: `${SITE_URL}/embaixadores`, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${SITE_URL}/hall-da-fama`, changeFrequency: 'weekly', priority: 0.5 },
    { url: `${SITE_URL}/parceiros`, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${SITE_URL}/investidores`, changeFrequency: 'monthly', priority: 0.4 },
    { url: `${SITE_URL}/kit`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${SITE_URL}/demo`, changeFrequency: 'monthly', priority: 0.4 },
    { url: `${SITE_URL}/loja`, changeFrequency: 'monthly', priority: 0.4 },
    { url: `${SITE_URL}/blog`, changeFrequency: 'weekly', priority: 0.7 },
    ...ARTIGOS.map(a => ({
      url: `${SITE_URL}/blog/${a.slug}`,
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    })),
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
