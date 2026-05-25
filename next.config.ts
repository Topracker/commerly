import type { NextConfig } from "next";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
// Extract host for CSP (e.g. "https://abc.supabase.co" → "abc.supabase.co")
const supabaseHost = supabaseUrl.replace(/^https?:\/\//, "")

// Mercado Pago checkout: JS SDK, API calls, secure-field/3DS iframes and the
// hosted checkout (Checkout Pro). Covers MP's multiple domains and CDNs.
const mercadoPagoHosts =
  "https://*.mercadopago.com https://*.mercadopago.com.br https://*.mercadolibre.com https://*.mercadolivre.com.br https://*.mlstatic.com"

const csp = [
  "default-src 'self'",
  // Next.js requires unsafe-inline/unsafe-eval for hydration scripts
  `script-src 'self' 'unsafe-inline' 'unsafe-eval' ${mercadoPagoHosts}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  // Browser-side connections: Supabase (REST + Realtime WS) + ViaCEP + Mercado Pago
  `connect-src 'self' https://${supabaseHost} wss://${supabaseHost} https://*.supabase.co wss://*.supabase.co https://viacep.com.br ${mercadoPagoHosts}`,
  "media-src 'none'",
  "object-src 'none'",
  // Mercado Pago embeds secure-field / 3DS / checkout iframes
  `frame-src ${mercadoPagoHosts}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  // Allow form posts that redirect to the Mercado Pago hosted checkout
  `form-action 'self' ${mercadoPagoHosts}`,
].join("; ")

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
          // HSTS: 1 year, includeSubDomains
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          { key: "Content-Security-Policy", value: csp },
        ],
      },
      {
        source: "/api/(.*)",
        headers: [
          {
            key: "Access-Control-Allow-Origin",
            value: process.env.NEXT_PUBLIC_APP_URL ?? "",
          },
          { key: "Access-Control-Allow-Methods", value: "GET, POST, DELETE, OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type, Authorization" },
          { key: "Access-Control-Max-Age", value: "86400" },
        ],
      },
    ];
  },
};

export default nextConfig;
