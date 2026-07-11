import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { ARTIGOS, artigoPorSlug } from '../../lib/blog'

export function generateStaticParams() {
  return ARTIGOS.map(a => ({ slug: a.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const a = artigoPorSlug(slug)
  if (!a) return { title: 'Artigo não encontrado' }
  return {
    title: a.titulo,
    description: a.descricao,
    keywords: a.keywords,
    alternates: { canonical: `/blog/${a.slug}` },
    openGraph: { title: a.titulo, description: a.descricao, type: 'article' },
  }
}

export default async function Artigo({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const a = artigoPorSlug(slug)
  if (!a) notFound()

  return (
    <main data-theme="dark" className="min-h-screen bg-fundo font-body">
      <header className="border-b border-borda bg-card/60 backdrop-blur sticky top-0 z-20">
        <div className="max-w-2xl mx-auto px-6 py-3">
          <Link href="/blog" className="text-gray-400 hover:text-white flex items-center gap-1.5 text-sm"><ArrowLeft size={16} /> Blog</Link>
        </div>
      </header>

      <article className="max-w-2xl mx-auto px-6 py-12">
        <p className="text-acento text-xs font-semibold uppercase tracking-wide mb-2">Commerly · {a.leitura} de leitura</p>
        <h1 className="font-display text-3xl sm:text-4xl font-bold text-white tracking-tight leading-tight">{a.titulo}</h1>
        <p className="text-gray-400 text-lg mt-4">{a.descricao}</p>

        <div className="mt-8 flex flex-col gap-6">
          {a.paragrafos.map((s, i) => (
            <div key={i}>
              {s.h && <h2 className="font-display text-white font-semibold text-xl mb-2">{s.h}</h2>}
              <p className="text-gray-300 leading-relaxed">{s.p}</p>
            </div>
          ))}
        </div>

        <div className="mt-10 bg-card border border-borda rounded-2xl p-5 text-center">
          <p className="text-white font-semibold">Quer colocar isso em prática?</p>
          <p className="text-gray-400 text-sm mt-1">A Commerly reúne gestão, delivery e fidelização num app só.</p>
          <Link href="/login" className="inline-block mt-4 bg-acento hover:bg-acento-forte text-white font-semibold px-6 py-3 rounded-2xl transition">Começar agora</Link>
        </div>
      </article>
    </main>
  )
}
