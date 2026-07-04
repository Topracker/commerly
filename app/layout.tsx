import type { Metadata } from "next";
import { Geist, Geist_Mono, Sora, Inter } from "next/font/google";
import "./globals.css";
import DevtoolsBlocker from "./components/DevtoolsBlocker";
import PWARegister from "./components/PWARegister";
import { SITE_URL, SITE_NAME, SITE_DESCRIPTION } from "./lib/site";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Sora (títulos) + Inter (corpo) — usados nas páginas de loja via as
// utilities `font-display` / `font-body` (ver globals.css @theme).
const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — Gestão completa para o seu comércio`,
    template: `%s — ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  manifest: "/manifest.json",
  keywords: [
    "gestão de comércio", "sistema para loja", "controle de estoque",
    "delivery", "vendas", "pagamentos", "fidelidade", "PDV", "Commerly",
  ],
  authors: [{ name: SITE_NAME }],
  alternates: { canonical: "/" },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
  },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: `${SITE_NAME} — Gestão completa para o seu comércio`,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    locale: "pt_BR",
    images: [{ url: "/icon-512.png", width: 512, height: 512, alt: SITE_NAME }],
  },
  twitter: {
    card: "summary",
    title: `${SITE_NAME} — Gestão completa para o seu comércio`,
    description: SITE_DESCRIPTION,
    images: ["/icon-512.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className={`${geistSans.variable} ${geistMono.variable} ${sora.variable} ${inter.variable} h-full antialiased`}>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#030712" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Commerly" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body className="min-h-full flex flex-col">
        <DevtoolsBlocker />
        <PWARegister />
        {children}
      </body>
    </html>
  );
}