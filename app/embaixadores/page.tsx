import type { Metadata } from 'next'
import Link from 'next/link'
import { MarketingShell, MCard } from '../components/MarketingShell'
import { Check } from 'lucide-react'
import { NIVEIS_EMBAIXADOR } from '../lib/crescimento'

export const metadata: Metadata = {
  title: 'Programa de Embaixadores Commerly',
  description: 'Represente a Commerly na sua cidade. Indique pessoas, gere pontos, suba de nível e ganhe recompensas.',
  alternates: { canonical: '/embaixadores' },
}

export default function Embaixadores() {
  return (
    <MarketingShell
      eyebrow="Programa de embaixadores"
      titulo="Leve a Commerly para a sua cidade"
      subtitulo="Qualquer pessoa pode ser embaixador. Convide comerciantes, clientes e entregadores com o seu código exclusivo, some pontos e suba de nível."
      cta={{ href: '/expansao', label: 'Ver a corrida das cidades' }}
    >
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        {NIVEIS_EMBAIXADOR.map(n => (
          <MCard key={n.nome}>
            <p className="font-semibold text-lg" style={{ color: n.cor }}>{n.emoji} {n.nome}</p>
            <p className="text-gray-500 text-xs mb-2">a partir de {n.min} indicações</p>
            <ul className="flex flex-col gap-1">
              {n.beneficios.map(b => (
                <li key={b} className="text-gray-400 text-sm flex items-start gap-1.5"><Check size={14} className="text-acento shrink-0 mt-0.5" /> {b}</li>
              ))}
            </ul>
          </MCard>
        ))}
      </div>

      <MCard>
        <p className="text-white font-semibold mb-2">Como funciona</p>
        <ul className="text-gray-300 text-sm flex flex-col gap-2">
          <li className="flex items-start gap-2"><Check size={16} className="text-acento shrink-0 mt-0.5" /> Você recebe um código exclusivo rastreável.</li>
          <li className="flex items-start gap-2"><Check size={16} className="text-acento shrink-0 mt-0.5" /> Cada cadastro pelo seu código gera pontos para você e para a sua cidade.</li>
          <li className="flex items-start gap-2"><Check size={16} className="text-acento shrink-0 mt-0.5" /> Suba de nível e desbloqueie cashback, desconto na mensalidade, desconto no kit e a jaqueta Commerly.</li>
          <li className="flex items-start gap-2"><Check size={16} className="text-acento shrink-0 mt-0.5" /> Ganhe um certificado digital de embaixador para compartilhar.</li>
        </ul>
        <p className="text-gray-500 text-sm mt-4">Já tem conta? O seu código de indicação aparece no seu painel. Veja o <Link href="/hall-da-fama" className="text-acento">Hall da Fama</Link> dos que mais indicam.</p>
      </MCard>
    </MarketingShell>
  )
}
