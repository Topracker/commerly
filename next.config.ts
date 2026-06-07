import type { NextConfig } from "next";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
// Extract host for CSP (e.g. "https://abc.supabase.co" → "abc.supabase.co")
const supabaseHost = supabaseUrl.replace(/^https?:\/\//, "")

// Mercado Pago checkout: JS SDK, API calls, secure-field/3DS iframes and the
// hosted checkout (Checkout Pro). Covers MP's multiple domains and CDNs.
const mercadoPagoHosts =
  "https://*.mercadopago.com https://*.mercadopago.com.br https://*.mercadolibre.com https://*.mercadolivre.com.br https://*.mlstatic.com"

// Stripe Checkout (hosted) e SDK JS
const stripeHosts = "https://checkout.stripe.com https://*.stripe.com https://js.stripe.com"

const csp = [
  "default-src 'self'",
  // Next.js requires unsafe-inline/unsafe-eval for hydration scripts
  `script-src 'self' 'unsafe-inline' 'unsafe-eval' ${mercadoPagoHosts} ${stripeHosts}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  // Browser-side connections: Supabase (REST + Realtime WS) + ViaCEP + Mercado Pago + Stripe
  `connect-src 'self' https://${supabaseHost} wss://${supabaseHost} https://*.supabase.co wss://*.supabase.co https://viacep.com.br ${mercadoPagoHosts} ${stripeHosts}`,
  "media-src 'none'",
  "object-src 'none'",
  // Mercado Pago / Stripe embeds secure-field / 3DS / checkout iframes
  `frame-src ${mercadoPagoHosts} ${stripeHosts}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  // Allow form posts that redirect to the Mercado Pago / Stripe hosted checkout
  `form-action 'self' ${mercadoPagoHosts} ${stripeHosts}`,
].join("; ")

const appUrl = process.env.NEXT_PUBLIC_APP_URL

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          // HSTS: 2 anos, includeSubDomains, preload — elegível para hstspreload.org
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "Content-Security-Policy", value: csp },
          // Endurecimentos adicionais — barram técnicas de side-channel
          // e isolam o documento como top-level browsing context
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "X-DNS-Prefetch-Control", value: "off" },
        ],
      },
      // CORS — só emite cabeçalhos quando há origem confiável definida.
      // Sem isso, "Access-Control-Allow-Origin: " (vazio) confunde proxies
      // intermediários e dá falsa sensação de configuração.
      ...(appUrl ? [{
        source: "/api/(.*)",
        headers: [
          { key: "Access-Control-Allow-Origin", value: appUrl },
          { key: "Vary", value: "Origin" },
          { key: "Access-Control-Allow-Methods", value: "GET, POST, DELETE, OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type, Authorization" },
          { key: "Access-Control-Max-Age", value: "86400" },
        ],
      }] : []),
    ];
  },
};

export default nextConfig;
