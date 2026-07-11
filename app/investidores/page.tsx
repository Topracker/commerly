import type { Metadata } from 'next'
import { MarketingShell, MCard } from '../components/MarketingShell'
import { TrendingUp, Network, Target } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Investidores — a visão da Commerly',
  description: 'A Commerly é o sistema operacional do pequeno comércio brasileiro. Conheça a visão, o modelo e o crescimento.',
  alternates: { canonical: '/investidores' },
}

export default function Investidores() {
  return (
    <MarketingShell
      eyebrow="Investidores"
      titulo="O sistema operacional de um mercado de milhões"
      subtitulo="O Brasil tem mais de 20 milhões de pequenos negócios. A Commerly os conecta — comerciantes, clientes e entregadores — num único ecossistema com efeito de rede."
    >
      <div className="grid sm:grid-cols-3 gap-3 mb-8">
        <MCard><Network size={20} className="text-acento mb-2" /><p className="text-white font-semibold">Efeito de rede</p><p className="text-gray-400 text-sm mt-1">Cada comerciante traz clientes; cada cliente atrai entregadores; a expansão é puxada pela própria comunidade, cidade a cidade.</p></MCard>
        <MCard><TrendingUp size={20} className="text-acento mb-2" /><p className="text-white font-semibold">Receita recorrente</p><p className="text-gray-400 text-sm mt-1">Mensalidade por comerciante (SaaS), sem depender de comissão por pedido. Delivery, kit e serviços somam.</p></MCard>
        <MCard><Target size={20} className="text-acento mb-2" /><p className="text-white font-semibold">Go-to-market</p><p className="text-gray-400 text-sm mt-1">Expansão gamificada por cidades, programa de fundadores e embaixadores locais reduzem o CAC.</p></MCard>
      </div>

      <MCard>
        <p className="text-white font-semibold mb-2">Métricas ao vivo</p>
        <p className="text-gray-400 text-sm">Os contadores de comerciantes, clientes, entregadores, pedidos e cidades estão públicos na <a href="/" className="text-acento">home</a> e na página de <a href="/expansao" className="text-acento">expansão</a>.</p>
        <p className="text-gray-500 text-sm mt-4">Contato: parcerias e investimento — <span className="text-white">Oryon Tecnologia</span>. Fale pelo <a href="/suporte" className="text-acento">suporte</a>.</p>
      </MCard>
    </MarketingShell>
  )
}
