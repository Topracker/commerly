import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PerfilPublicoView } from '../../components/PerfilPublicoView'
import { carregarPerfil } from '../../lib/perfilPublico'
import { idDoSlug } from '../../lib/crescimento'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const id = idDoSlug(slug)
  const p = id ? await carregarPerfil('entregador', id) : null
  if (!p) return { title: 'Perfil não encontrado — Commerly' }
  return {
    title: `${p.nome} — Entregador na Commerly`,
    description: `${p.nome} · nível ${p.nivel.nome} · ${p.metricaValor} entregas.`,
    alternates: { canonical: `/entregador/${slug}` },
  }
}

export default async function EntregadorSlug({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const id = idDoSlug(slug)
  const p = id ? await carregarPerfil('entregador', id) : null
  if (!p) notFound()
  return <PerfilPublicoView p={p} />
}
