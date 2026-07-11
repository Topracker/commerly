import type { Metadata } from 'next'
import Link from 'next/link'
import { MarketingShell } from '../components/MarketingShell'
import { Play, Store, User, Bike } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Demonstração da Commerly',
  description: 'Uma visão rápida da Commerly — o sistema operacional do pequeno comércio.',
  alternates: { canonical: '/demo' },
}

export default function Demo() {
  return (
    <MarketingShell
      eyebrow="Demonstração"
      titulo="A Commerly em 60 segundos"
      subtitulo="Uma plataforma. Três papéis. Um ecossistema."
    >
      {/* Vídeo de demonstração (placeholder com thumbnail) */}
      <div className="relative rounded-2xl overflow-hidden border border-borda bg-gradient-to-br from-azul/25 via-elevado to-acento/15 aspect-video flex items-center justify-center mb-8">
        <button className="w-16 h-16 rounded-full bg-white/90 text-black flex items-center justify-center hover:scale-105 transition" aria-label="Assistir demonstração">
          <Play size={26} className="ml-1 fill-black" />
        </button>
        <span className="absolute bottom-3 right-3 text-xs text-white/80 bg-black/40 rounded-full px-2 py-0.5">vídeo 60s · em breve</span>
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        {[
          { Icone: Store, t: 'Comerciante', d: 'Gerencia tudo: vendas, estoque, financeiro e delivery.', href: '/para-comerciantes' },
          { Icone: User, t: 'Cliente', d: 'Descobre lojas locais, pede e ganha cashback.', href: '/para-clientes' },
          { Icone: Bike, t: 'Entregador', d: 'Ganha por corrida, com liberdade e recompensas.', href: '/para-entregadores' },
        ].map(p => (
          <Link key={p.t} href={p.href} className="grupo bg-card border border-borda rounded-2xl p-5 hover:border-acento/40 transition">
            <p.Icone size={20} className="text-acento mb-2 grupo-icone" />
            <p className="text-white font-semibold">{p.t}</p>
            <p className="text-gray-400 text-sm mt-1">{p.d}</p>
          </Link>
        ))}
      </div>
    </MarketingShell>
  )
}
