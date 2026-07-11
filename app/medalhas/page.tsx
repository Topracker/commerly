import type { Metadata } from 'next'
import Link from 'next/link'
import { MarketingShell } from '../components/MarketingShell'
import { createAdminClient } from '../lib/supabase-admin'
import { MEDALHAS } from '../lib/crescimento'

export const metadata: Metadata = {
  title: 'Medalhas e conquistas — Commerly',
  description: 'Todas as medalhas da Commerly: como conquistar cada uma e quantas pessoas já têm.',
  alternates: { canonical: '/medalhas' },
}
export const dynamic = 'force-dynamic'

export default async function Medalhas() {
  const admin = createAdminClient()
  const { data } = await admin.from('medalhas_usuarios').select('slug')
  const contagem: Record<string, number> = {}
  for (const r of data || []) contagem[r.slug] = (contagem[r.slug] || 0) + 1

  return (
    <MarketingShell
      eyebrow="Conquistas"
      titulo="Medalhas da Commerly"
      subtitulo="Cada uma conta uma história. Colecione as suas."
    >
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {MEDALHAS.map(m => (
          <Link key={m.slug} href={`/medalhas/${m.slug}`} className="grupo bg-card border border-borda rounded-2xl p-4 text-center hover:border-acento/40 transition">
            <div className="text-4xl mb-2 grupo-icone">{m.emoji}</div>
            <p className="text-white text-sm font-semibold">{m.secreta ? 'Secreta' : m.nome}</p>
            <p className="text-gray-500 text-[11px] mt-1">{contagem[m.slug] || 0} {(contagem[m.slug] || 0) === 1 ? 'pessoa' : 'pessoas'}</p>
          </Link>
        ))}
      </div>
    </MarketingShell>
  )
}
