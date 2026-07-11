import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { createAdminClient } from '../../lib/supabase-admin'
import { MEDALHAS, medalhaPorSlug } from '../../lib/crescimento'
import { BaixarConquista } from '../../components/BaixarConquista'

export function generateStaticParams() {
  return MEDALHAS.map(m => ({ slug: m.slug }))
}
export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const m = medalhaPorSlug(slug)
  if (!m) return { title: 'Medalha não encontrada' }
  return { title: `Medalha ${m.nome} — Commerly`, description: m.descricao, alternates: { canonical: `/medalhas/${slug}` } }
}

export default async function MedalhaDetalhe({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const m = medalhaPorSlug(slug)
  if (!m) notFound()

  const admin = createAdminClient()
  const { count } = await admin.from('medalhas_usuarios').select('id', { count: 'exact', head: true }).eq('slug', slug)

  const share = `Conquistei a medalha ${m.emoji} ${m.nome} na Commerly! #Commerly`
  return (
    <main data-theme="dark" className="min-h-screen bg-fundo font-body">
      <header className="border-b border-borda bg-card/60 backdrop-blur sticky top-0 z-20">
        <div className="max-w-2xl mx-auto px-6 py-3">
          <Link href="/medalhas" className="text-gray-400 hover:text-white flex items-center gap-1.5 text-sm"><ArrowLeft size={16} /> Medalhas</Link>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-6 py-14 text-center">
        <div className="text-7xl mb-4">{m.emoji}</div>
        <h1 className="font-display text-3xl font-bold text-white">{m.nome}</h1>
        <p className="text-gray-400 mt-3">{m.descricao}</p>

        <div className="grid grid-cols-2 gap-3 mt-8 text-left">
          <div className="bg-card border border-borda rounded-2xl p-4">
            <p className="text-gray-500 text-xs mb-1">Quem tem</p>
            <p className="text-white font-bold text-2xl tabular-nums">{count || 0}</p>
            <p className="text-gray-500 text-xs">pessoas conquistaram</p>
          </div>
          <div className="bg-card border border-borda rounded-2xl p-4">
            <p className="text-gray-500 text-xs mb-1">Como conquistar</p>
            <p className="text-gray-300 text-sm">{m.como}</p>
          </div>
        </div>

        {/* Compartilhar */}
        <div className="flex items-center justify-center flex-wrap gap-2 mt-8">
          <BaixarConquista emoji={m.emoji} titulo={m.secreta ? 'Conquista secreta' : m.nome} subtitulo={m.descricao} arquivo={`medalha-${slug}`} />
          <a href={`https://wa.me/?text=${encodeURIComponent(share)}`} target="_blank" rel="noopener noreferrer" className="bg-[#25D366] text-white text-sm font-semibold px-4 py-2 rounded-xl">WhatsApp</a>
          <a href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent('https://commerly.vercel.app/medalhas/' + slug)}`} target="_blank" rel="noopener noreferrer" className="bg-[#0a66c2] text-white text-sm font-semibold px-4 py-2 rounded-xl">LinkedIn</a>
          <a href="https://www.instagram.com/" target="_blank" rel="noopener noreferrer" className="bg-gradient-to-br from-[#f09433] via-[#dc2743] to-[#bc1888] text-white text-sm font-semibold px-4 py-2 rounded-xl">Instagram</a>
        </div>
        <p className="text-gray-500 text-xs mt-3">Baixe o card e poste no seu story marcando <span className="text-acento">#Commerly</span>.</p>
      </div>
    </main>
  )
}
