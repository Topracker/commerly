import type { Metadata } from 'next'
import Link from 'next/link'
import { PRECO_FUNDADOR, PRECO_NORMAL, MESES_FUNDADOR, VAGAS_FUNDADOR } from '../lib/precos'
import { CATEGORIAS_FAQ } from '../lib/faq'
import ChatIA from './ChatIA'
import RegistrarOrigem from './RegistrarOrigem'
import { ArrowRight } from 'lucide-react'

// Landing de destino do QR do panfleto físico (?origem=panfleto). Não é a
// home: aqui tem FAQ + chat de IA + CTA direto pro cadastro, do jeito que o
// panfleto promete. A origem (qual canal trouxe a visita) é registrada em
// RegistrarOrigem (client, lê o query param e loga 1x por sessão).
export const metadata: Metadata = {
  title: 'Conheça a Commerly',
  description: 'Vendas, fiado, gastos, produtos e delivery num só lugar. Veja como funciona e tire suas dúvidas com a IA da Commerly.',
}

export default function Conheca() {
  const perguntasComerciante = CATEGORIAS_FAQ
    .map(c => ({ ...c, perguntas: c.perguntas.filter(p => p.publico.includes('comerciante')) }))
    .filter(c => c.perguntas.length > 0)

  return (
    <div className="min-h-screen bg-fundo text-white">
      <RegistrarOrigem />

      <section className="max-w-xl mx-auto px-5 pt-14 pb-10 text-center">
        <h1 className="font-display text-3xl font-bold leading-tight">
          Seu comércio ainda funciona no caderno?
        </h1>
        <p className="mt-3 text-gray-400 text-base">
          Do fiado ao delivery, tudo na palma da sua mão.
        </p>
        <Link
          href="/onboarding"
          className="mt-6 inline-flex items-center gap-2 bg-azul hover:brightness-110 text-white font-semibold py-3 px-6 rounded-xl transition"
        >
          Criar minha loja agora <ArrowRight size={18} />
        </Link>
        <p className="mt-3 text-sm text-gray-500">
          R$ {PRECO_FUNDADOR.toFixed(2).replace('.', ',')}/mês nos primeiros {MESES_FUNDADOR} meses —
          oferta de fundador para as primeiras {VAGAS_FUNDADOR} lojas. Depois, R$ {PRECO_NORMAL.toFixed(2).replace('.', ',')}/mês.
        </p>
      </section>

      <section className="max-w-xl mx-auto px-5 pb-10">
        <div className="bg-card border border-borda rounded-2xl p-5">
          <h2 className="font-display font-semibold text-lg mb-1">Tire suas dúvidas com a IA da Commerly</h2>
          <p className="text-sm text-gray-400 mb-4">Pergunta sobre preço, fiado, delivery, qualquer coisa.</p>
          <ChatIA />
        </div>
      </section>

      <section className="max-w-xl mx-auto px-5 pb-16">
        <h2 className="font-display font-semibold text-lg mb-4">Perguntas frequentes</h2>
        <div className="flex flex-col gap-3">
          {perguntasComerciante.flatMap(c => c.perguntas).slice(0, 8).map(p => (
            <details key={p.id} className="bg-card border border-borda rounded-xl p-4 group">
              <summary className="cursor-pointer font-medium text-sm list-none flex items-center justify-between">
                {p.pergunta}
                <span className="text-gray-500 group-open:rotate-45 transition">+</span>
              </summary>
              <p className="mt-3 text-sm text-gray-400 whitespace-pre-line">{p.resposta}</p>
            </details>
          ))}
        </div>
        <Link href="/suporte" className="mt-4 inline-block text-sm text-azul hover:underline">
          Ver central de ajuda completa →
        </Link>
      </section>
    </div>
  )
}
