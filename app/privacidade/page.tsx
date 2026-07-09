import type { Metadata } from 'next'
import { PaginaLegal, Secao, Lista } from '../components/PaginaLegal'
import { CONTATO, EMPRESA, PRODUTO, cnpjTexto } from '../lib/legal'

export const metadata: Metadata = {
  title: 'Política de Privacidade',
  description: `Como a ${PRODUTO.nome} trata seus dados pessoais, conforme a LGPD.`,
}

export default function Privacidade() {
  return (
    <PaginaLegal
      titulo="Política de Privacidade"
      subtitulo="Como tratamos seus dados pessoais, conforme a Lei nº 13.709/2018 (LGPD)."
      mostrarData
    >
      <Secao titulo="1. Controlador dos dados">
        <p>
          O controlador é {EMPRESA.razaoSocial}, {cnpjTexto()}, com sede em {EMPRESA.endereco}.
        </p>
        <p>
          Encarregado pelo tratamento de dados pessoais (DPO):{' '}
          <a href={`mailto:${CONTATO.encarregado}`} className="text-blue-400 hover:text-blue-300 underline">
            {CONTATO.encarregado}
          </a>
        </p>
      </Secao>

      <Secao titulo="2. Quais dados coletamos">
        <p><strong className="text-gray-300">Comerciantes:</strong></p>
        <Lista itens={[
          'Nome da loja, segmento, CPF ou CNPJ, telefone, endereço e coordenadas geográficas.',
          'Foto da fachada, horário de funcionamento, redes sociais e site.',
          'Dados operacionais: produtos, custos, vendas, gastos, fiados, agendamentos e pedidos.',
        ]} />

        <p className="mt-2"><strong className="text-gray-300">Clientes:</strong></p>
        <Lista itens={[
          'Nome, CPF, telefone e e-mail de cadastro.',
          'Endereço de entrega e coordenadas do local informado.',
          'Histórico de pedidos, avaliações (com fotos, se enviadas) e saldo de pontos.',
        ]} />

        <p className="mt-2"><strong className="text-gray-300">Entregadores:</strong></p>
        <Lista itens={[
          'Nome, CPF, data de nascimento, telefone e foto de perfil.',
          'Documento de identificação e CNH (número, categoria e imagem), quando o veículo exigir.',
          <><strong className="text-gray-300">Localização em tempo real</strong>, coletada apenas enquanto você estiver com o status &quot;online&quot; ou com uma entrega em andamento.</>,
          'Comprovantes de entrega e avaliações recebidas.',
        ]} />

        <p className="mt-2"><strong className="text-gray-300">Fornecedores:</strong> nome, CNPJ, categoria, telefone, localização e catálogo de produtos.</p>

        <p className="mt-2"><strong className="text-gray-300">Todos os perfis:</strong> endereço de e-mail, identificador de sessão, e — se você autorizar — o endpoint de notificações push do seu navegador.</p>
      </Secao>

      <Secao titulo="3. Para que usamos e com que base legal">
        <Lista itens={[
          <><strong className="text-gray-300">Executar o contrato</strong> (art. 7º, V): criar sua conta, processar pedidos, calcular taxa de entrega, atribuir corridas, cobrar a assinatura.</>,
          <><strong className="text-gray-300">Cumprir obrigação legal</strong> (art. 7º, II): guardar registros fiscais e de acesso exigidos por lei.</>,
          <><strong className="text-gray-300">Legítimo interesse</strong> (art. 7º, IX): prevenir fraude, garantir segurança e melhorar a plataforma. Você pode se opor a qualquer momento.</>,
          <><strong className="text-gray-300">Consentimento</strong> (art. 7º, I): geolocalização precisa, notificações push e comunicações promocionais. Pode ser revogado a qualquer momento.</>,
        ]} />
      </Secao>

      <Secao titulo="4. Com quem compartilhamos">
        <p>Não vendemos seus dados. Compartilhamos apenas o necessário, com:</p>
        <Lista itens={[
          <><strong className="text-gray-300">Supabase</strong> — banco de dados e autenticação (operador).</>,
          <><strong className="text-gray-300">Vercel</strong> — hospedagem da aplicação (operador).</>,
          <><strong className="text-gray-300">Stripe, Mercado Pago e PagBank</strong> — processamento de pagamentos. Recebem os dados necessários à cobrança; não recebemos o número completo do seu cartão.</>,
          <><strong className="text-gray-300">Google (Gemini)</strong> — recursos de inteligência artificial (Assistente e Copilot). Enviamos dados agregados do seu negócio (faturamento, produtos, estoque) e o texto das perguntas que você digita. <strong className="text-gray-300">Não envie dados pessoais de terceiros nas perguntas.</strong></>,
          <><strong className="text-gray-300">OpenStreetMap / Nominatim</strong> — conversão de endereço em coordenadas. O endereço é enviado pelo nosso servidor, sem identificar você.</>,
          <>Comerciantes, clientes e entregadores <strong className="text-gray-300">entre si</strong>, no estrito necessário para concluir um pedido (ex.: o entregador vê o endereço de entrega; a loja vê o nome e telefone do cliente).</>,
        ]} />
        <p>
          Alguns desses serviços processam dados fora do Brasil. Nesses casos, a transferência
          internacional se apoia nas cláusulas do art. 33 da LGPD.
        </p>
      </Secao>

      <Secao titulo="5. Localização do entregador">
        <p>
          A posição do entregador é gravada apenas enquanto ele estiver online ou com uma entrega
          ativa, e é compartilhada com a loja e com o cliente daquele pedido para acompanhamento em
          tempo real. Ao ficar offline, a coleta cessa. O histórico de localização de uma entrega é
          descartado quando o pedido é concluído.
        </p>
      </Secao>

      <Secao titulo="6. Por quanto tempo guardamos">
        <Lista itens={[
          'Dados de cadastro: enquanto a conta existir.',
          'Registros de pedidos, vendas e pagamentos: 5 anos após a transação, para fins fiscais e de defesa em eventual processo.',
          'Registros de acesso: 6 meses, conforme o Marco Civil da Internet (Lei nº 12.965/2014, art. 15).',
          'Conversas com o Assistente de IA: até você excluí-las ou encerrar a conta.',
        ]} />
      </Secao>

      <Secao titulo="7. Seus direitos (art. 18 da LGPD)">
        <p>Você pode, a qualquer momento, solicitar:</p>
        <Lista itens={[
          'Confirmação da existência de tratamento e acesso aos seus dados.',
          'Correção de dados incompletos, inexatos ou desatualizados.',
          'Anonimização, bloqueio ou eliminação de dados desnecessários ou tratados em desconformidade.',
          'Portabilidade dos dados a outro fornecedor.',
          'Eliminação dos dados tratados com base no seu consentimento.',
          'Informação sobre com quem compartilhamos seus dados.',
          'Revogação do consentimento.',
        ]} />
        <p>
          Para exercer qualquer um deles, escreva para{' '}
          <a href={`mailto:${CONTATO.encarregado}`} className="text-blue-400 hover:text-blue-300 underline">
            {CONTATO.encarregado}
          </a>. Respondemos em até 15 dias.
        </p>
      </Secao>

      <Secao titulo="8. Segurança">
        <p>
          Usamos conexão criptografada (HTTPS), controle de acesso por linha no banco de dados
          (row level security) e segregação de credenciais. Nenhum sistema é totalmente imune —
          se ocorrer um incidente de segurança relevante, comunicaremos você e a ANPD nos prazos
          da lei.
        </p>
      </Secao>

      <Secao titulo="9. Cookies">
        <p>
          Usamos apenas cookies necessários ao funcionamento: manter sua sessão autenticada e
          proteger formulários contra requisições forjadas. Não usamos cookies de publicidade nem
          de rastreamento entre sites.
        </p>
      </Secao>

      <Secao titulo="10. Crianças e adolescentes">
        <p>
          A plataforma não se destina a menores de 18 anos. Não coletamos intencionalmente dados
          de crianças e adolescentes. Se identificarmos um cadastro assim, ele será removido.
        </p>
      </Secao>

      <Secao titulo="11. Alterações">
        <p>
          Podemos atualizar esta Política. Mudanças relevantes serão comunicadas no painel ou por
          e-mail com 30 dias de antecedência.
        </p>
      </Secao>
    </PaginaLegal>
  )
}
