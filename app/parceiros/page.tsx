import type { Metadata } from 'next'
import { MarketingShell, MCard } from '../components/MarketingShell'
import { Check, Award } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Programa de Parceiros — comissão por indicação',
  description: 'Contadores, consultores, agências e influenciadores: indique comerciantes e ganhe comissão recorrente com código rastreável.',
  alternates: { canonical: '/parceiros' },
}

const NIVEIS = [
  { nome: 'Bronze', cor: '#cd7f32', emoji: '🥉', com: '20% do primeiro mês', req: 'Ao entrar no programa' },
  { nome: 'Prata', cor: '#c0c0c0', emoji: '🥈', com: '25% do primeiro mês', req: 'A partir de 10 comerciantes ativos' },
  { nome: 'Ouro', cor: '#f5c34b', emoji: '🥇', com: '30% + recorrência', req: 'A partir de 30 comerciantes ativos' },
]

export default function Parceiros() {
  return (
    <MarketingShell
      eyebrow="Programa de parceiros"
      titulo="Indique comerciantes e ganhe comissão"
      subtitulo="Para contadores, consultores, agências e influenciadores. Código rastreável, dashboard de conversões e certificado oficial."
      cta={{ href: '/suporte', label: 'Quero ser parceiro' }}
    >
      <div className="grid sm:grid-cols-3 gap-3 mb-8">
        {NIVEIS.map(n => (
          <MCard key={n.nome}>
            <p className="font-semibold text-lg" style={{ color: n.cor }}>{n.emoji} {n.nome}</p>
            <p className="text-white text-2xl font-bold mt-1">{n.com}</p>
            <p className="text-gray-500 text-xs mt-1">{n.req}</p>
          </MCard>
        ))}
      </div>
      <MCard>
        <p className="text-white font-semibold mb-3 flex items-center gap-2"><Award size={18} className="text-acento" /> O que você recebe</p>
        <ul className="grid sm:grid-cols-2 gap-2">
          {['Código rastreável único por parceiro', 'Dashboard de indicações, conversões e ganhos', 'Certificado digital de Parceiro Oficial', 'Comissões crescentes por nível', 'Material de divulgação pronto', 'Prioridade no suporte'].map(b => (
            <li key={b} className="text-gray-300 text-sm flex items-start gap-2"><Check size={16} className="text-acento shrink-0 mt-0.5" /> {b}</li>
          ))}
        </ul>
      </MCard>
    </MarketingShell>
  )
}
