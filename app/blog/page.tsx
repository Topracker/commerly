import type { Metadata } from 'next'
import Link from 'next/link'
import { MarketingShell } from '../components/MarketingShell'
import { ARTIGOS } from '../lib/blog'
import { ArrowRight } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Blog Commerly — gestão, vendas e delivery para o comércio local',
  description: 'Conteúdo prático para donos de pequenos comércios: vender mais, organizar o financeiro, delivery próprio e fidelização.',
  alternates: { canonical: '/blog' },
}

export default function Blog() {
  return (
    <MarketingShell
      eyebrow="Blog"
      titulo="Ideias práticas para o seu comércio"
      subtitulo="Sem enrolação: o que funciona no dia a dia de quem toca uma loja."
    >
      <div className="grid sm:grid-cols-2 gap-4">
        {ARTIGOS.map(a => (
          <Link key={a.slug} href={`/blog/${a.slug}`} className="grupo bg-card border border-borda rounded-2xl p-5 hover:border-acento/40 transition flex flex-col">
            <p className="text-white font-display font-semibold text-lg leading-snug">{a.titulo}</p>
            <p className="text-gray-400 text-sm mt-2 flex-1">{a.descricao}</p>
            <p className="text-acento text-sm mt-3 flex items-center gap-1.5">Ler artigo <ArrowRight size={14} className="grupo-icone" /></p>
            <p className="text-gray-600 text-xs mt-1">{a.leitura} de leitura</p>
          </Link>
        ))}
      </div>
    </MarketingShell>
  )
}
