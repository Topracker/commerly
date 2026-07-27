import type { Metadata } from 'next'
import { MarketingShell, MCard } from '../components/MarketingShell'
import { KitTracking } from '../components/KitTracking'
import { Check } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Kit Oficial do Entregador',
  description: 'Bolsa com QR Code, adesivo, chaveiro, cartão e manual. Item opcional de identidade visual do entregador parceiro Commerly — em breve à venda.',
  alternates: { canonical: '/kit' },
}

// O kit NÃO ativa conta e NÃO libera corrida — quem roda o despacho é
// app/lib/dispatch.ts, que filtra por disponível + posição recente + raio.
// O fluxo abaixo é o de virar entregador; o kit fica fora dele de propósito.
// Não volte a colocar "Compra do Kit" aqui enquanto não existir checkout:
// prometer um gate que não existe é o que esta página já fez uma vez.
const FLUXO = ['Cadastro', 'Documentos', 'Aprovação', 'Já pode aceitar corridas']
const RASTREIO = ['Pagamento', 'Produção', 'Embalado', 'Enviado', 'Saiu para entrega', 'Recebido', 'Ativado']
const CONTEUDO = [
  { n: 'Bolsa com QR Code', d: '“Escaneie e peça” de um lado, “Seja um parceiro” do outro.' },
  { n: 'Adesivo', d: 'Para a moto, a bike ou a bolsa.' },
  { n: 'Chaveiro', d: 'Da rede oficial Commerly.' },
  { n: 'Cartão de boas-vindas', d: '“Agora você faz parte da rede oficial da Commerly.”' },
  { n: 'Manual', d: 'Como aceitar corridas, subir de nível e ganhar mais.' },
]

export default function Kit() {
  return (
    <MarketingShell
      eyebrow="Kit oficial do entregador"
      titulo="Sua vitrine ambulante"
      subtitulo="Bolsa, adesivo e QR Code da rede oficial. É item opcional de identidade visual — você já pode aceitar corridas sem ele. A venda abre em breve."
      cta={{ href: '/entregador-delivery/login', label: 'Começar cadastro' }}
    >
      {/* Rastreio real do kit. Só aparece para entregador logado — para o
          visitante a página continua sendo só a apresentação do kit. */}
      <KitTracking />

      <MCard className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-500/40 text-amber-300">Em breve</span>
        </div>
        <p className="text-gray-300 text-sm leading-relaxed">
          Ainda não abrimos a venda do kit. Isso <strong className="text-white">não te impede de rodar</strong>:
          com o cadastro aprovado você já aparece para as lojas e já recebe corridas normalmente.
          Avisamos por aqui e por notificação quando der para pedir o seu.
        </p>
      </MCard>

      <MCard className="mb-6">
        <p className="text-white font-semibold mb-3">Como funciona</p>
        <div className="flex flex-wrap items-center gap-2">
          {FLUXO.map((f, i) => (
            <span key={f} className="flex items-center gap-2">
              <span className="text-sm text-gray-300 bg-superficie border border-borda rounded-full px-3 py-1">{i + 1}. {f}</span>
              {i < FLUXO.length - 1 && <span className="text-gray-600">→</span>}
            </span>
          ))}
        </div>
      </MCard>

      <div className="grid sm:grid-cols-2 gap-6">
        <MCard>
          <p className="text-white font-semibold mb-3">O que vem no kit</p>
          <ul className="flex flex-col gap-2">
            {CONTEUDO.map(c => (
              <li key={c.n} className="flex items-start gap-2">
                <Check size={16} className="text-acento shrink-0 mt-0.5" />
                <span><span className="text-white text-sm font-medium">{c.n}</span><span className="text-gray-400 text-sm"> — {c.d}</span></span>
              </li>
            ))}
          </ul>
          <p className="text-gray-500 text-xs mt-4">Desconto progressivo por nível: Prata 10%, Ouro 20%, Diamante 30%.</p>
        </MCard>

        <MCard>
          <p className="text-white font-semibold mb-3">Acompanhe o seu kit</p>
          <ol className="flex flex-col gap-2">
            {RASTREIO.map((r, i) => (
              <li key={r} className="flex items-center gap-3">
                <span className="w-6 h-6 rounded-full bg-elevado border border-borda text-gray-400 text-xs flex items-center justify-center shrink-0">{i + 1}</span>
                <span className="text-gray-300 text-sm">{r}</span>
              </li>
            ))}
          </ol>
        </MCard>
      </div>
    </MarketingShell>
  )
}
