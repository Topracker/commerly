import type { Metadata } from 'next'
import { MarketingShell, MCard } from '../../components/MarketingShell'
import { FormListaEspera } from './FormListaEspera'
import { DollarSign, MapPin, Clock } from 'lucide-react'

// Lista de espera de entregador — link curto para grupo de WhatsApp de motoboy:
//   commerly.com.br/entregador/em-breve
// Não cria conta (ver /api/publico/entregador-interesse). Fica aberta mesmo com
// a chave `entregador` desligada (exceção em lib/pausa.ts).

export const metadata: Metadata = {
  title: 'Entregador Commerly — entre na lista de espera',
  description: 'O delivery da Commerly está abrindo bairro a bairro. Deixe seu WhatsApp e seja avisado primeiro quando abrir na sua região.',
  alternates: { canonical: '/entregador/em-breve' },
  openGraph: {
    title: 'Entregador Commerly — lista de espera',
    description: 'Ganhe por corrida com o comércio do seu bairro. Deixe seu WhatsApp e seja avisado primeiro.',
  },
}

export default function EntregadorEmBreve() {
  return (
    <MarketingShell
      eyebrow="Entregadores"
      titulo="Rode pelo comércio do seu bairro"
      subtitulo="O delivery da Commerly está abrindo bairro a bairro. Deixe seus dados e avisamos você primeiro quando abrir na sua região."
    >
      <div className="grid sm:grid-cols-3 gap-3 mb-8">
        <MCard><DollarSign size={20} className="text-acento mb-2" /><p className="text-white font-semibold">Corrida que vale</p><p className="text-gray-400 text-sm mt-1">Valor mínimo fixo por corrida e mais por km rodado, com gorjeta 100% sua.</p></MCard>
        <MCard><MapPin size={20} className="text-acento mb-2" /><p className="text-white font-semibold">Perto de você</p><p className="text-gray-400 text-sm mt-1">Corridas curtas, das lojas do bairro onde você já roda.</p></MCard>
        <MCard><Clock size={20} className="text-acento mb-2" /><p className="text-white font-semibold">Seu horário</p><p className="text-gray-400 text-sm mt-1">Fica online quando quiser. Sem meta e sem escala.</p></MCard>
      </div>
      <FormListaEspera />
    </MarketingShell>
  )
}
