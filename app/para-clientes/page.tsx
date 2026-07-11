import type { Metadata } from 'next'
import { MarketingShell, MCard } from '../components/MarketingShell'
import { Zap, Tag, Store, Check } from 'lucide-react'
import { NIVEIS_CLIENTE } from '../lib/crescimento'

export const metadata: Metadata = {
  title: 'Para Clientes — peça do comércio local com desconto',
  description: 'Descubra comércios locais, peça delivery, ganhe cashback e suba de nível no Clube Commerly.',
  alternates: { canonical: '/para-clientes' },
}

export default function ParaClientes() {
  return (
    <MarketingShell
      eyebrow="Para clientes"
      titulo="O melhor do seu bairro, na palma da mão"
      subtitulo="Peça dos comércios locais, ganhe cashback e desbloqueie benefícios conforme você pede."
      cta={{ href: '/cliente/login', label: 'Descobrir comércios' }}
    >
      <div className="grid sm:grid-cols-3 gap-3 mb-8">
        <MCard><Zap size={20} className="text-acento mb-2" /><p className="text-white font-semibold">Praticidade</p><p className="text-gray-400 text-sm mt-1">Peça em segundos e acompanhe a entrega ao vivo no mapa.</p></MCard>
        <MCard><Tag size={20} className="text-acento mb-2" /><p className="text-white font-semibold">Desconto</p><p className="text-gray-400 text-sm mt-1">Cashback no Clube Commerly e promoções das lojas por perto.</p></MCard>
        <MCard><Store size={20} className="text-acento mb-2" /><p className="text-white font-semibold">Variedade local</p><p className="text-gray-400 text-sm mt-1">Hamburguerias, mercados, farmácias, pet shops e muito mais.</p></MCard>
      </div>

      <MCard>
        <p className="text-white font-semibold mb-3">Clube Commerly — quanto mais você pede, mais ganha</p>
        <div className="grid sm:grid-cols-2 gap-2">
          {NIVEIS_CLIENTE.map(n => (
            <div key={n.nome} className="rounded-xl border border-borda bg-superficie p-3">
              <p className="font-semibold" style={{ color: n.cor }}>{n.emoji} {n.nome} <span className="text-gray-500 text-xs font-normal">· {n.min} pedidos</span></p>
              <ul className="mt-1 flex flex-col gap-0.5">
                {n.beneficios.map(b => (
                  <li key={b} className="text-gray-400 text-sm flex items-start gap-1.5"><Check size={14} className="text-acento shrink-0 mt-0.5" /> {b}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </MCard>
    </MarketingShell>
  )
}
