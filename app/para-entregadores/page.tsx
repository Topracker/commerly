import type { Metadata } from 'next'
import Link from 'next/link'
import { MarketingShell, MCard } from '../components/MarketingShell'
import { DollarSign, Clock, Package, Check } from 'lucide-react'
import { NIVEIS_ENTREGADOR } from '../lib/crescimento'

export const metadata: Metadata = {
  title: 'Para Entregadores — ganhe por corrida com liberdade',
  description: 'Seja entregador parceiro Commerly. Ganhe por corrida, escolha seus horários, suba de nível e receba recompensas físicas.',
  alternates: { canonical: '/para-entregadores' },
}

export default function ParaEntregadores() {
  return (
    <MarketingShell
      eyebrow="Para entregadores"
      titulo="Ganhe por corrida, com liberdade"
      subtitulo="Você escolhe quando trabalhar. Suba de nível, ganhe bônus e recompensas físicas — jaqueta, kit e mais."
      cta={{ href: '/entregador-delivery/login', label: 'Quero ser entregador' }}
    >
      <div className="grid sm:grid-cols-3 gap-3 mb-8">
        <MCard><DollarSign size={20} className="text-acento mb-2" /><p className="text-white font-semibold">Ganhos por corrida</p><p className="text-gray-400 text-sm mt-1">Taxa por distância + bônus em corridas especiais (Modo Festa paga +20%).</p></MCard>
        <MCard><Clock size={20} className="text-acento mb-2" /><p className="text-white font-semibold">Liberdade total</p><p className="text-gray-400 text-sm mt-1">Fique online quando quiser. Sem meta obrigatória, sem patrão.</p></MCard>
        <MCard><Package size={20} className="text-acento mb-2" /><p className="text-white font-semibold">Kit oficial</p><p className="text-gray-400 text-sm mt-1">Bolsa com QR Code, adesivo e manual. <Link href="/kit" className="text-acento">Ver o kit →</Link></p></MCard>
      </div>

      <MCard>
        <p className="text-white font-semibold mb-3">Níveis e recompensas</p>
        <div className="grid sm:grid-cols-2 gap-2">
          {NIVEIS_ENTREGADOR.map(n => (
            <div key={n.nome} className="rounded-xl border border-borda bg-superficie p-3">
              <p className="font-semibold" style={{ color: n.cor }}>{n.emoji} {n.nome} <span className="text-gray-500 text-xs font-normal">· {n.min} pts</span></p>
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
