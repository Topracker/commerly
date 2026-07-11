import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PerfilPublicoView } from '../../components/PerfilPublicoView'
import { carregarPerfil } from '../../lib/perfilPublico'
import { idDoSlug } from '../../lib/crescimento'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const id = idDoSlug(slug)
  const p = id ? await carregarPerfil('comerciante', id) : null
  if (!p) return { title: 'Perfil não encontrado — Commerly' }
  return {
    title: `${p.nome} — Comerciante na Commerly`,
    description: `${p.nome} · nível ${p.nivel.nome} · ${p.metricaValor} pedidos${p.cidade ? ` · ${p.cidade}` : ''}.`,
    alternates: { canonical: `/comerciante/${slug}` },
  }
}

export default async function ComercianteSlug({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const id = idDoSlug(slug)
  const p = id ? await carregarPerfil('comerciante', id) : null
  if (!p) notFound()
  return <PerfilPublicoView p={p} />
}
