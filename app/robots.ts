import type { MetadataRoute } from 'next'
import { SITE_URL } from './lib/site'

// Robots.txt gerado pelo Next. Libera as páginas públicas (home e páginas de
// loja) e bloqueia as áreas autenticadas/privadas e a API.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/dashboard',
          '/configuracoes',
          '/onboarding',
          '/planos',
          '/integracoes',
          '/produtos',
          '/vendas',
          '/gastos',
          '/fiado',
          '/agenda',
          '/servicos',
          '/pedidos',
          '/funcionarios',
          '/fornecedores',
          '/historico',
          '/notificacoes',
          '/mensagens',
          '/feedback',
          '/assistente',
          '/login',
          '/cliente/login',
          '/cliente/onboarding',
          '/cliente/dashboard',
          '/cliente/notificacoes',
          '/cliente/mensagens',
          '/fornecedor/',
          '/entregador-delivery/',
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
