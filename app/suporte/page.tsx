import type { Metadata } from 'next'
import Link from 'next/link'
import { PaginaLegal } from '../components/PaginaLegal'
import { CONTATO, PRODUTO } from '../lib/legal'
import { PERGUNTAS_FAQ } from '../lib/faq'
import { Mail, MessageSquare, KeyRound, CreditCard, UserX, GraduationCap, ArrowRight } from 'lucide-react'
import FormularioContato, { BotaoCopiarEmail } from './FormularioContato'
import CentralAjuda from './CentralAjuda'

export const metadata: Metadata = {
  title: 'Central de ajuda',
  description: `Central de ajuda da ${PRODUTO.nome}: perguntas frequentes sobre conta, planos, pedidos, pagamento e delivery — e como falar com a gente.`,
}

// Ordem da página: autoatendimento primeiro (atalhos → FAQ com busca), contato
// direto por último. Quem resolve sozinho não precisa esperar 1 dia útil, e
// quem escreve chega ao formulário já sabendo que a dúvida não estava no FAQ.
// O FAQ mora em lib/faq.ts; esta página só monta a casca.

const ATALHOS = [
  { href: '/recuperar-senha', label: 'Recuperar senha', sub: 'Link por e-mail', icon: KeyRound, cor: 'bg-amber-500/15 text-amber-300' },
  { href: '/planos', label: 'Assinatura e planos', sub: 'Assinar, cancelar, teste', icon: CreditCard, cor: 'bg-blue-500/15 text-blue-300' },
  { href: '/excluir-conta', label: 'Excluir conta', sub: 'Com ou sem acesso ao app', icon: UserX, cor: 'bg-red-500/15 text-red-300' },
  { href: '/academy', label: 'Commerly Academy', sub: 'Mini aulas para vender mais', icon: GraduationCap, cor: 'bg-green-500/15 text-green-300' },
] as const

// Dados estruturados de FAQ: o Google pode mostrar as perguntas direto na busca.
function faqJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: PERGUNTAS_FAQ.map(p => ({
      '@type': 'Question',
      name: p.pergunta,
      acceptedAnswer: { '@type': 'Answer', text: p.resposta.replace(/\n\n/g, ' ') },
    })),
  }
}

export default function Suporte() {
  return (
    <PaginaLegal
      titulo="Central de ajuda"
      subtitulo="Procure sua dúvida aqui — a maioria se resolve na hora. Se não achar, fale com a gente no fim da página."
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd()) }}
      />

      {/* Atalhos: ações que a pessoa resolve sozinha sem ler nada */}
      <nav aria-label="Atalhos" className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {ATALHOS.map(a => (
          <Link key={a.href} href={a.href}
            className="bg-gray-900 border border-gray-800 hover:border-gray-700 rounded-2xl p-3.5 flex flex-col gap-2 transition">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${a.cor}`}>
              <a.icon size={17} />
            </div>
            <div className="min-w-0">
              <p className="text-white font-semibold text-sm leading-tight">{a.label}</p>
              <p className="text-gray-500 text-xs mt-0.5">{a.sub}</p>
            </div>
          </Link>
        ))}
      </nav>

      <CentralAjuda />

      {/* Contato direto — o último recurso, mas sempre visível */}
      <section id="contato" className="scroll-mt-6 border-t border-gray-800 pt-8 flex flex-col gap-4">
        <div>
          <h2 className="text-white font-semibold text-lg">Não achou o que procurava?</h2>
          <p className="text-gray-400 text-sm mt-1">
            Conte o que aconteceu, com o horário e, se possível, uma captura de tela — isso encurta
            muito o caminho até a solução. Respondemos em até 1 dia útil.
          </p>
        </div>

        <FormularioContato />

        <div className="grid sm:grid-cols-2 gap-3">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/15 flex items-center justify-center shrink-0">
              <Mail size={18} className="text-blue-300" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-white font-semibold text-sm">Prefere escrever direto?</p>
              <div className="flex items-center gap-2 mt-0.5">
                <a href={`mailto:${CONTATO.email}`} className="text-gray-500 text-xs break-all hover:text-blue-300 transition">
                  {CONTATO.email}
                </a>
                <BotaoCopiarEmail email={CONTATO.email} />
              </div>
              <p className="text-gray-600 text-xs mt-1">Resposta em até 1 dia útil.</p>
            </div>
          </div>

          <Link
            href="/feedback"
            className="bg-gray-900 border border-gray-800 hover:border-blue-700 rounded-2xl p-4 flex items-start gap-3 transition"
          >
            <div className="w-10 h-10 rounded-xl bg-green-500/15 flex items-center justify-center shrink-0">
              <MessageSquare size={18} className="text-green-300" />
            </div>
            <div className="min-w-0">
              <p className="text-white font-semibold text-sm inline-flex items-center gap-1">
                Enviar feedback <ArrowRight size={13} className="text-gray-500" />
              </p>
              <p className="text-gray-500 text-xs">Sugestões e bugs, direto do painel.</p>
              <p className="text-gray-600 text-xs mt-0.5">Precisa estar logado como comerciante.</p>
            </div>
          </Link>
        </div>
      </section>
    </PaginaLegal>
  )
}
