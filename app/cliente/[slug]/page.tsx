import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PerfilPublicoView } from '../../components/PerfilPublicoView'
import { carregarPerfil } from '../../lib/perfilPublico'
import { idDoSlug } from '../../lib/crescimento'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const id = idDoSlug(slug)
  const p = id ? await carregarPerfil('cliente', id) : null
  if (!p) return { title: 'Perfil não encontrado — Commerly' }
  if (p.privado) return { title: 'Perfil privado — Commerly', robots: { index: false } }
  return {
    title: `${p.nome} — Cliente na Commerly`,
    description: `${p.nome} · nível ${p.nivel.nome} · ${p.medalhas.length} medalhas.`,
    alternates: { canonical: `/cliente/${slug}` },
  }
}

export default async function ClienteSlug({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const id = idDoSlug(slug)
  const p = id ? await carregarPerfil('cliente', id) : null
  if (!p) notFound()
  return <PerfilPublicoView p={p} />
}
