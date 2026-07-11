import type { Metadata } from 'next'
import { MarketingShell, MCard } from '../components/MarketingShell'
import { createAdminClient } from '../lib/supabase-admin'
import { Store, Bike, Trophy, MapPin, Handshake } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Hall da Fama Commerly',
  description: 'Os melhores da Commerly: top comerciantes, entregadores, embaixadores, cidades e parceiros.',
  alternates: { canonical: '/hall-da-fama' },
}

export const dynamic = 'force-dynamic'

export default async function HallDaFama() {
  const admin = createAdminClient()
  const { data: cidades } = await admin
    .from('cidades_expansao').select('nome, uf, pontos').order('pontos', { ascending: false }).limit(5)

  const secoes = [
    { titulo: 'Top Comerciantes', Icone: Store, itens: [] as string[] },
    { titulo: 'Top Entregadores', Icone: Bike, itens: [] as string[] },
    { titulo: 'Top Embaixadores', Icone: Trophy, itens: [] as string[] },
    { titulo: 'Top Parceiros', Icone: Handshake, itens: [] as string[] },
  ]

  return (
    <MarketingShell
      eyebrow="Hall da Fama"
      titulo="Os que constroem a Commerly"
      subtitulo="Reconhecimento para quem faz a comunidade crescer."
    >
      <MCard className="mb-6">
        <p className="text-white font-semibold mb-3 flex items-center gap-2"><MapPin size={18} className="text-acento" /> Top Cidades</p>
        {cidades && cidades.length > 0 ? (
          <ol className="flex flex-col gap-2">
            {cidades.map((c, i) => (
              <li key={c.nome} className="flex items-center justify-between text-sm">
                <span className="text-white">{['🥇', '🥈', '🥉', '4º', '5º'][i]} {c.nome}/{c.uf}</span>
                <span className="text-gray-500 tabular-nums">{c.pontos} pts</span>
              </li>
            ))}
          </ol>
        ) : <p className="text-gray-500 text-sm">Ainda somando pontos.</p>}
      </MCard>

      <div className="grid sm:grid-cols-2 gap-3">
        {secoes.map(s => (
          <MCard key={s.titulo}>
            <p className="text-white font-semibold mb-2 flex items-center gap-2"><s.Icone size={18} className="text-acento" /> {s.titulo}</p>
            <p className="text-gray-500 text-sm">O ranking aparece aqui assim que a comunidade da sua região crescer. 🚀</p>
          </MCard>
        ))}
      </div>
    </MarketingShell>
  )
}
