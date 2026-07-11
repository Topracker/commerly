import type { Metadata } from 'next'
import { MarketingShell, MCard } from '../components/MarketingShell'
import { Clock, LineChart, DollarSign, Check } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Para Comerciantes — sistema de gestão e delivery próprio',
  description: 'Sistema para hamburgueria, pizzaria, barbearia, mercado e mais. Gestão de vendas, estoque, financeiro e delivery próprio sem comissão por venda.',
  alternates: { canonical: '/para-comerciantes' },
}

const DORES = [
  { Icone: Clock, dor: 'Tempo perdido', txt: 'Anotar pedido no caderno, somar no papel, conferir estoque na mão.', sol: 'Tudo num app: pedidos, estoque e caixa automáticos.' },
  { Icone: LineChart, dor: 'Sem controle', txt: 'Não sabe o lucro real, quanto vende por dia nem o que sai mais.', sol: 'Commerly Score, relatórios e ranking de produtos.' },
  { Icone: DollarSign, dor: 'Caro demais', txt: 'Marketplaces cobram 20-30% de comissão sobre cada venda.', sol: 'Mensalidade fixa, sem comissão sobre o que você vende.' },
]

const BENEFICIOS = [
  'Delivery próprio com entregadores parceiros e GPS ao vivo',
  'Cardápio digital com QR Code para a mesa',
  'Financeiro real: fluxo de caixa, lucro e o DAS do MEI',
  'Feed social para aparecer para clientes por perto',
  'Programa de fidelidade e cashback (Clube Commerly)',
  'Copilot de IA com insights de venda toda semana',
]

export default function ParaComerciantes() {
  return (
    <MarketingShell
      eyebrow="Para comerciantes"
      titulo="A sua loja inteira num app só"
      subtitulo="Do balcão ao delivery, do estoque ao financeiro. Sem comissão sobre cada venda — só uma mensalidade justa."
      cta={{ href: '/login', label: 'Começar agora' }}
    >
      <div className="grid sm:grid-cols-3 gap-3 mb-8">
        {DORES.map(d => (
          <MCard key={d.dor}>
            <d.Icone size={20} className="text-acento mb-2" />
            <p className="text-white font-semibold">{d.dor}</p>
            <p className="text-gray-400 text-sm mt-1">{d.txt}</p>
            <p className="text-acento text-sm mt-2 flex items-start gap-1.5"><Check size={15} className="shrink-0 mt-0.5" /> {d.sol}</p>
          </MCard>
        ))}
      </div>

      <MCard>
        <p className="text-white font-semibold mb-3">Tudo o que você desbloqueia</p>
        <ul className="grid sm:grid-cols-2 gap-2">
          {BENEFICIOS.map(b => (
            <li key={b} className="text-gray-300 text-sm flex items-start gap-2">
              <Check size={16} className="text-acento shrink-0 mt-0.5" /> {b}
            </li>
          ))}
        </ul>
      </MCard>
    </MarketingShell>
  )
}
