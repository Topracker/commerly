// URL canônica pública do site (sem barra final). Usada em metadata, sitemap
// e robots. Em produção vem de NEXT_PUBLIC_APP_URL; o fallback evita quebrar
// build/preview quando a env ainda não está definida.
export const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://commerly.app').replace(/\/+$/, '')

export const SITE_NAME = 'Commerly'
export const SITE_DESCRIPTION =
  'Commerly é a plataforma completa para o seu comércio: gestão de vendas, estoque, delivery, clientes e pagamentos — tudo num só lugar.'
