import type { Metadata } from "next";
import { Geist, Geist_Mono, Sora, Inter } from "next/font/google";
import "./globals.css";
import DevtoolsBlocker from "./components/DevtoolsBlocker";
import PWARegister from "./components/PWARegister";
import PushManager from "./components/PushManager";
import { Footer } from "./components/Footer";
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
    <html
      lang="pt-BR"
      data-theme="dark"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${sora.variable} ${inter.variable} h-full antialiased`}
    >
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#0a0f1a" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Commerly" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
        {/*
          Aplica o tema salvo ANTES da primeira pintura. Sem isto, quem escolheu
          o tema claro veria um flash do fundo escuro a cada navegação. O default
          é escuro, então qualquer falha aqui cai no tema atual do app.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var d=document.documentElement,s=d.style;var t=localStorage.getItem('commerly:tema')==='claro'?'light':'dark';d.dataset.theme=t;var A={verde:{dark:['#00c896','#00a97e','#04231d'],light:['#00815f','#00694d','#fff']},azul:{dark:['#2f6bff','#1f57e6','#fff'],light:['#0052cc','#0043a6','#fff']},roxo:{dark:['#a855f7','#9333ea','#fff'],light:['#7c3aed','#6d28d9','#fff']},laranja:{dark:['#fb923c','#f97316','#3a1a02'],light:['#c2410c','#9a3412','#fff']},vermelho:{dark:['#f05252','#e02424','#fff'],light:['#dc2626','#b91c1c','#fff']}};var a=localStorage.getItem('commerly:acento');if(!A[a])a='verde';var c=A[a][t==='light'?'light':'dark'];s.setProperty('--color-acento',c[0]);s.setProperty('--color-acento-forte',c[1]);s.setProperty('--tinta-acento',c[2]);var b=parseFloat(localStorage.getItem('commerly:brilho'));if(b&&b!==1&&b>=0.8&&b<=1.15)s.filter='brightness('+b+')'}catch(e){}`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        <DevtoolsBlocker />
        <PWARegister />
        <PushManager />
        {children}
        <Footer />
      </body>
    </html>
  );
}