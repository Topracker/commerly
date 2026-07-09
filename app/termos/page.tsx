import type { Metadata } from 'next'
import { PaginaLegal, Secao, Lista } from '../components/PaginaLegal'
import { CONTATO, EMPRESA, PRODUTO } from '../lib/legal'
import { COMISSAO_PCT } from '../lib/b2b'

export const metadata: Metadata = {
  title: 'Termos de Uso',
  description: `Termos e condições de uso da ${PRODUTO.nome}.`,
}

export default function Termos() {
  return (
    <PaginaLegal
      titulo="Termos de Uso"
      subtitulo={`Condições para usar a ${PRODUTO.nome}.`}
      mostrarData
    >
      <Secao titulo="1. Quem somos">
        <p>
          A {PRODUTO.nome} é uma {PRODUTO.descricao}, operada por {EMPRESA.razaoSocial},
          inscrita no CNPJ {EMPRESA.cnpj}, com sede em {EMPRESA.endereco} (&quot;{EMPRESA.nome}&quot;,
          &quot;nós&quot;).
        </p>
        <p>
          Ao criar uma conta ou usar a plataforma, você concorda com estes Termos. Se não
          concordar, não use a {PRODUTO.nome}.
        </p>
      </Secao>

      <Secao titulo="2. Perfis de usuário">
        <p>A plataforma atende quatro perfis, com direitos e deveres distintos:</p>
        <Lista itens={[
          <><strong className="text-gray-300">Comerciante</strong>: cadastra a loja, vende, gerencia estoque, pedidos e clientes.</>,
          <><strong className="text-gray-300">Cliente</strong>: compra das lojas cadastradas, acumula pontos e avalia.</>,
          <><strong className="text-gray-300">Entregador</strong>: aceita corridas das lojas com quem tem parceria.</>,
          <><strong className="text-gray-300">Fornecedor</strong>: oferta produtos no marketplace B2B para comerciantes.</>,
        ]} />
        <p>
          Você é responsável pela veracidade dos dados informados e pela guarda das suas
          credenciais. Atividades feitas na sua conta são de sua responsabilidade.
        </p>
      </Secao>

      <Secao titulo="3. A Commerly não é parte das transações">
        <p>
          A {PRODUTO.nome} é uma <strong className="text-gray-300">plataforma de intermediação
          tecnológica</strong>. Quando um cliente compra de uma loja, o contrato de compra e venda
          é entre o cliente e o comerciante. Quando um comerciante compra de um fornecedor, o
          contrato é entre eles.
        </p>
        <p>
          Não somos fornecedores dos produtos anunciados, não os produzimos nem os armazenamos,
          e não respondemos pela qualidade, entrega, prazo, garantia ou vícios. O comerciante é o
          fornecedor perante o Código de Defesa do Consumidor.
        </p>
      </Secao>

      <Secao titulo="4. Assinatura e cobranças">
        <Lista itens={[
          <>O acesso ao painel do comerciante depende de assinatura mensal, cobrada por meio do processador de pagamentos, com renovação automática.</>,
          <>O <strong className="text-gray-300">Commerly Ads</strong> é uma assinatura opcional que destaca a loja na busca. Ao cancelar, o destaque vale até o fim do período já pago.</>,
          <>Nas compras do <strong className="text-gray-300">marketplace B2B</strong>, retemos uma comissão de {COMISSAO_PCT}% sobre o valor do pedido pago pela plataforma.</>,
          <>Você pode cancelar a qualquer momento. Não há reembolso proporcional de períodos já iniciados, salvo determinação legal.</>,
          <>Preços e condições podem mudar, com aviso prévio de 30 dias por e-mail ou no painel.</>,
        ]} />
      </Secao>

      <Secao titulo="5. Pagamentos">
        <p>
          Os pagamentos são processados por terceiros (como Stripe, Mercado Pago e PagBank).
          Não armazenamos dados completos de cartão. O uso desses serviços também se submete
          aos termos de cada processador.
        </p>
        <p>
          Quando o pagamento é feito online, o valor é repassado à conta do comerciante ou do
          fornecedor conectada ao processador, descontadas as taxas e a comissão aplicável.
        </p>
      </Secao>

      <Secao titulo="6. Entregas">
        <p>
          Entregadores atuam de forma autônoma e independente. Não há vínculo empregatício entre
          a {EMPRESA.nome} e os entregadores, nem entre a {EMPRESA.nome} e os comerciantes.
        </p>
        <p>
          A taxa de entrega é calculada pela distância entre a loja e o endereço informado, com
          acréscimo em horários de pico. O valor é exibido antes da confirmação do pedido.
        </p>
      </Secao>

      <Secao titulo="7. Programa de pontos (Clube Commerly)">
        <Lista itens={[
          <>Clientes acumulam 1 ponto por real gasto em produtos. A taxa de entrega não pontua.</>,
          <>Os pontos valem em qualquer loja da plataforma e são resgatados em múltiplos de 100.</>,
          <>Pontos não são moeda, não têm valor de face, não podem ser transferidos, vendidos nem convertidos em dinheiro.</>,
          <>Podemos encerrar ou alterar o programa com aviso prévio de 30 dias. Pontos acumulados poderão ser resgatados nesse prazo.</>,
        ]} />
      </Secao>

      <Secao titulo="8. Conduta proibida">
        <p>É vedado usar a plataforma para:</p>
        <Lista itens={[
          'Anunciar produtos ilícitos, falsificados ou cuja venda dependa de licença que você não tenha.',
          'Fraudar pagamentos, avaliações, pontos, cupons ou o programa de destaque.',
          'Coletar dados de outros usuários, automatizar acessos ou tentar burlar limites técnicos.',
          'Violar direitos de terceiros, incluindo propriedade intelectual e privacidade.',
        ]} />
        <p>
          Podemos suspender ou encerrar contas que violem estes Termos, sem prejuízo das medidas
          cabíveis.
        </p>
      </Secao>

      <Secao titulo="9. Conteúdo do usuário">
        <p>
          Fotos, descrições, avaliações e demais conteúdos que você publica continuam seus. Você
          nos concede licença não exclusiva e gratuita para exibi-los na plataforma e em materiais
          de divulgação do seu comércio, enquanto sua conta existir.
        </p>
        <p>Você garante ter os direitos sobre o que publica.</p>
      </Secao>

      <Secao titulo="10. Disponibilidade e limitação de responsabilidade">
        <p>
          A plataforma é fornecida &quot;no estado em que se encontra&quot;. Não garantimos
          funcionamento ininterrupto nem ausência de erros, e podemos realizar manutenções.
        </p>
        <p>
          Na máxima extensão permitida pela lei, nossa responsabilidade por danos decorrentes do
          uso da plataforma fica limitada ao valor pago por você à {EMPRESA.nome} nos 12 meses
          anteriores ao fato. Nada nesta cláusula afasta direitos irrenunciáveis do consumidor.
        </p>
      </Secao>

      <Secao titulo="11. Encerramento">
        <p>
          Você pode encerrar sua conta a qualquer momento. Podemos encerrá-la em caso de violação
          destes Termos ou de exigência legal. Após o encerramento, tratamos seus dados conforme a{' '}
          <a href="/privacidade" className="text-blue-400 hover:text-blue-300 underline">Política de Privacidade</a>.
        </p>
      </Secao>

      <Secao titulo="12. Alterações destes Termos">
        <p>
          Podemos alterar estes Termos. Mudanças relevantes serão avisadas com 30 dias de
          antecedência. Continuar usando a plataforma após a vigência significa concordar com a
          nova versão.
        </p>
      </Secao>

      <Secao titulo="13. Lei aplicável e foro">
        <p>
          Estes Termos são regidos pelas leis brasileiras. Fica eleito o foro do domicílio do
          consumidor para dirimir controvérsias, conforme o Código de Defesa do Consumidor.
        </p>
      </Secao>

      <Secao titulo="14. Contato">
        <p>
          Dúvidas sobre estes Termos:{' '}
          <a href={`mailto:${CONTATO.email}`} className="text-blue-400 hover:text-blue-300 underline">
            {CONTATO.email}
          </a>
        </p>
      </Secao>
    </PaginaLegal>
  )
}
