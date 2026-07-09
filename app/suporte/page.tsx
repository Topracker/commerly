import type { Metadata } from 'next'
import Link from 'next/link'
import { PaginaLegal, Secao } from '../components/PaginaLegal'
import { CONTATO, PRODUTO } from '../lib/legal'
import { Mail, MessageSquare, ChevronDown } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Suporte',
  description: `Central de ajuda da ${PRODUTO.nome}: perguntas frequentes e canais de contato.`,
}

type Pergunta = { p: string; r: React.ReactNode }

const FAQ: { grupo: string; itens: Pergunta[] }[] = [
  {
    grupo: 'Conta e assinatura',
    itens: [
      {
        p: 'Como cancelo minha assinatura?',
        r: <>No painel, vá em <strong className="text-gray-300">Meu Plano</strong> e clique em cancelar. O acesso continua até o fim do período já pago.</>,
      },
      {
        p: 'Esqueci minha senha. E agora?',
        r: <>Na tela de login, use a opção de recuperação. O link chega no e-mail cadastrado — confira também a caixa de spam.</>,
      },
      {
        p: 'Posso ter mais de uma loja na mesma conta?',
        r: <>Hoje cada conta de comerciante corresponde a uma loja. Para uma segunda loja, crie outra conta com outro e-mail.</>,
      },
    ],
  },
  {
    grupo: 'Vendas e delivery',
    itens: [
      {
        p: 'Como a taxa de entrega é calculada?',
        r: <>Pela distância entre a loja e o endereço do cliente, em linha reta. Em horário de pico há um acréscimo. Se a loja não tiver coordenadas cadastradas, cai num valor mínimo — vale conferir o endereço em Configurações.</>,
      },
      {
        p: 'Um pedido não apareceu no painel. O que houve?',
        r: <>Pedidos pagos online só são criados após a confirmação do pagamento. No Pix isso pode levar alguns minutos. Se passar disso, fale com o suporte com o horário e o valor.</>,
      },
      {
        p: 'Como funciona o Commerly Ads?',
        r: <>É uma assinatura mensal opcional que coloca sua loja no topo da busca, com um selo de destaque. Cancela quando quiser; o destaque vale até o fim do período pago.</>,
      },
    ],
  },
  {
    grupo: 'Clube Commerly (pontos)',
    itens: [
      {
        p: 'Onde meus pontos valem?',
        r: <>Em <strong className="text-gray-300">qualquer loja</strong> da plataforma. O saldo é único, não importa em qual loja você acumulou.</>,
      },
      {
        p: 'Quanto vale um ponto?',
        r: <>Você ganha 1 ponto por real gasto em produtos (a taxa de entrega não pontua) e resgata em múltiplos de 100 pontos, que viram R$ 5 de desconto.</>,
      },
    ],
  },
  {
    grupo: 'Entregadores',
    itens: [
      {
        p: 'Por que não recebo corridas?',
        r: <>Você precisa estar <strong className="text-gray-300">online</strong>, com o GPS ativo, e ter uma parceria aceita com a loja. As ofertas vão para o entregador disponível mais próximo, dentro de um raio de 5 km da loja.</>,
      },
      {
        p: 'Posso levar dois pedidos ao mesmo tempo?',
        r: <>Sim. Quando houver um segundo pedido de uma loja próxima e com entrega na mesma direção, aparece a opção <strong className="text-gray-300">&quot;Aceitar junto&quot;</strong> no seu painel. A rota é reordenada automaticamente.</>,
      },
      {
        p: 'Quando recebo pelas corridas?',
        r: <>O repasse vai para a conta que você conectou ao processador de pagamentos, após a confirmação da entrega pelo código do cliente.</>,
      },
    ],
  },
  {
    grupo: 'Dados e privacidade',
    itens: [
      {
        p: 'Como excluo minha conta e meus dados?',
        r: <>Escreva para {CONTATO.encarregado} pedindo a exclusão. Respondemos em até 15 dias. Alguns registros fiscais são mantidos pelo prazo legal, conforme a Política de Privacidade.</>,
      },
      {
        p: 'O que a IA da Commerly enxerga do meu negócio?',
        r: <>O Assistente e o Copilot enviam dados agregados (faturamento, produtos, estoque, gastos) e o texto da sua pergunta para o modelo. Não envie dados pessoais de terceiros nas perguntas.</>,
      },
    ],
  },
]

export default function Suporte() {
  return (
    <PaginaLegal
      titulo="Suporte"
      subtitulo="Respostas rápidas para as dúvidas mais comuns — e como falar com a gente."
    >
      {/* Contato primeiro: quem chega aqui com problema quer resolver, não ler. */}
      <div className="grid sm:grid-cols-2 gap-3">
        <a
          href={`mailto:${CONTATO.email}`}
          className="bg-gray-900 border border-gray-800 hover:border-blue-700 rounded-2xl p-4 flex items-start gap-3 transition"
        >
          <div className="w-10 h-10 rounded-xl bg-blue-500/15 flex items-center justify-center shrink-0">
            <Mail size={18} className="text-blue-300" />
          </div>
          <div className="min-w-0">
            <p className="text-white font-semibold text-sm">E-mail</p>
            <p className="text-gray-500 text-xs break-all">{CONTATO.email}</p>
            <p className="text-gray-600 text-xs mt-0.5">Resposta em até 1 dia útil.</p>
          </div>
        </a>

        <Link
          href="/feedback"
          className="bg-gray-900 border border-gray-800 hover:border-blue-700 rounded-2xl p-4 flex items-start gap-3 transition"
        >
          <div className="w-10 h-10 rounded-xl bg-green-500/15 flex items-center justify-center shrink-0">
            <MessageSquare size={18} className="text-green-300" />
          </div>
          <div className="min-w-0">
            <p className="text-white font-semibold text-sm">Enviar feedback</p>
            <p className="text-gray-500 text-xs">Sugestões e bugs, direto do painel.</p>
            <p className="text-gray-600 text-xs mt-0.5">Precisa estar logado.</p>
          </div>
        </Link>
      </div>

      {FAQ.map(({ grupo, itens }) => (
        <Secao key={grupo} titulo={grupo}>
          <div className="flex flex-col gap-2">
            {itens.map(({ p, r }) => (
              // <details> nativo: acordeão sem JavaScript, funciona com o
              // conteúdo já no HTML (bom para busca e leitores de tela).
              <details key={p} className="group bg-gray-900 border border-gray-800 rounded-xl">
                <summary className="flex items-center justify-between gap-3 cursor-pointer list-none p-3.5">
                  <span className="text-gray-200 text-sm font-medium">{p}</span>
                  <ChevronDown size={16} className="text-gray-500 shrink-0 transition-transform group-open:rotate-180" />
                </summary>
                <div className="px-3.5 pb-3.5 -mt-1 text-gray-400 text-sm leading-relaxed">{r}</div>
              </details>
            ))}
          </div>
        </Secao>
      ))}

      <Secao titulo="Não achou o que procurava?">
        <p>
          Escreva para{' '}
          <a href={`mailto:${CONTATO.email}`} className="text-blue-400 hover:text-blue-300 underline">
            {CONTATO.email}
          </a>{' '}
          descrevendo o que aconteceu, com o horário e, se possível, uma captura de tela. Isso
          encurta muito o caminho até a solução.
        </p>
      </Secao>
    </PaginaLegal>
  )
}
