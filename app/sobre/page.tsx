import type { Metadata } from 'next'
import Link from 'next/link'
import { PaginaLegal, Secao, Lista } from '../components/PaginaLegal'
import { CONTATO, EMPRESA, PRODUTO } from '../lib/legal'

export const metadata: Metadata = {
  title: 'Sobre',
  description: `Conheça a ${PRODUTO.nome} e a ${EMPRESA.nome}.`,
}

const PILARES = [
  {
    emoji: '🏪',
    titulo: 'Para o comerciante',
    texto: 'Vendas, estoque, gastos, fiado, agenda e clientes num painel só. Sem planilha, sem caderno.',
  },
  {
    emoji: '🛵',
    titulo: 'Para o entregador',
    texto: 'Corridas das lojas parceiras, rota na mão e pagamento direto na conta.',
  },
  {
    emoji: '🛒',
    titulo: 'Para o cliente',
    texto: 'Comprar do comércio do bairro com a facilidade dos grandes aplicativos — e acumulando pontos que valem em qualquer loja.',
  },
  {
    emoji: '📦',
    titulo: 'Para o fornecedor',
    texto: 'Um canal direto com os comerciantes da região, com comparação de preços transparente.',
  },
]

export default function Sobre() {
  return (
    <PaginaLegal titulo={`Sobre a ${PRODUTO.nome}`}>
      <Secao titulo="O que é a Commerly">
        <p>
          A {PRODUTO.nome} é uma {PRODUTO.descricao}, feita para o pequeno comércio brasileiro —
          a mercearia, a barbearia, a lanchonete, a distribuidora de bebidas.
        </p>
        <p>
          A ideia é simples: o comerciante de bairro merece as mesmas ferramentas que as grandes
          redes têm, sem precisar de time de TI nem de contrato caro. Gestão, delivery,
          pagamentos, fidelidade e inteligência artificial no mesmo lugar, por uma mensalidade
          que cabe no caixa.
        </p>
      </Secao>

      <Secao titulo="Quem atendemos">
        <div className="grid sm:grid-cols-2 gap-3 mt-1">
          {PILARES.map(p => (
            <div key={p.titulo} className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
              <span className="text-2xl">{p.emoji}</span>
              <p className="text-white font-semibold text-sm mt-1.5">{p.titulo}</p>
              <p className="text-gray-500 text-xs mt-1 leading-relaxed">{p.texto}</p>
            </div>
          ))}
        </div>
      </Secao>

      <Secao titulo={`Sobre a ${EMPRESA.nome}`}>
        <p>
          A {PRODUTO.nome} é um produto da {EMPRESA.nome} ({EMPRESA.razaoSocial}, CNPJ{' '}
          {EMPRESA.cnpj}), com sede em {EMPRESA.endereco}.
        </p>
        <p>
          A {EMPRESA.nome} constrói software para negócios que sustentam a economia local. A
          {' '}{PRODUTO.nome} é a nossa aposta de que a tecnologia que hoje concentra o comércio
          nas mãos de poucos pode, com o desenho certo, devolvê-lo para o bairro.
        </p>
      </Secao>

      <Secao titulo="No que acreditamos">
        <Lista itens={[
          <><strong className="text-gray-300">O dado é do comerciante.</strong> Ele leva sua base de clientes, produtos e histórico para onde quiser.</>,
          <><strong className="text-gray-300">Preço claro.</strong> Uma mensalidade, sem taxa escondida por pedido. As comissões, quando existem, estão nos Termos.</>,
          <><strong className="text-gray-300">O pequeno junto é grande.</strong> Os pontos do Clube valem em qualquer loja da rede — o cliente de uma vira cliente de todas.</>,
        ]} />
      </Secao>

      <Secao titulo="Fale com a gente">
        <p>
          Dúvidas, sugestões ou problemas:{' '}
          <a href={`mailto:${CONTATO.email}`} className="text-blue-400 hover:text-blue-300 underline">
            {CONTATO.email}
          </a>
        </p>
        <p className="text-gray-500 text-sm">
          Veja também a <Link href="/suporte" className="text-blue-400 hover:text-blue-300 underline">central de suporte</Link>,
          os <Link href="/termos" className="text-blue-400 hover:text-blue-300 underline">Termos de Uso</Link> e a{' '}
          <Link href="/privacidade" className="text-blue-400 hover:text-blue-300 underline">Política de Privacidade</Link>.
        </p>
      </Secao>
    </PaginaLegal>
  )
}
