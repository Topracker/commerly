import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

// Casca visual comum às páginas de marketing/comunidade (server component).
// Mantém o tema escuro (independe da preferência do usuário logado) e um layout
// consistente com hero + conteúdo.
export function MarketingShell({
  eyebrow, titulo, subtitulo, children, cta,
}: {
  eyebrow?: string
  titulo: string
  subtitulo?: string
  children: React.ReactNode
  cta?: { href: string; label: string }
}) {
  return (
    <main data-theme="dark" className="min-h-screen bg-fundo font-body">
      <header className="border-b border-borda bg-card/60 backdrop-blur sticky top-0 z-20">
        <div className="max-w-4xl mx-auto px-6 py-3 flex items-center gap-3">
          <Link href="/" className="text-gray-400 hover:text-white flex items-center gap-1.5 text-sm">
            <ArrowLeft size={16} /> Commerly
          </Link>
        </div>
      </header>

      <section className="px-6 pt-14 pb-8 text-center">
        <div className="max-w-3xl mx-auto">
          {eyebrow && <p className="text-acento text-xs font-semibold uppercase tracking-wide mb-2">{eyebrow}</p>}
          <h1 className="font-display text-4xl sm:text-5xl font-bold text-white tracking-tight">{titulo}</h1>
          {subtitulo && <p className="text-gray-400 text-lg mt-4 leading-relaxed">{subtitulo}</p>}
          {cta && (
            <Link
              href={cta.href}
              className="inline-flex items-center gap-2 mt-6 bg-acento hover:bg-acento-forte text-white font-semibold px-6 py-3 rounded-2xl transition"
            >
              {cta.label}
            </Link>
          )}
        </div>
      </section>

      <div className="max-w-4xl mx-auto px-6 pb-24">{children}</div>
    </main>
  )
}

// Card simples reutilizável.
export function MCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-card border border-borda rounded-2xl p-5 ${className}`}>{children}</div>
}

export default MarketingShell
