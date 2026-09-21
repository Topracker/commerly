// ============================================================================
// FAQ da Central de Ajuda (/suporte) — conteúdo no código, como a Academy.
// ----------------------------------------------------------------------------
// Cada resposta descreve o comportamento REAL do app; quando o comportamento
// mudar, mude a resposta junto (as constantes citadas vêm de lib/precos.ts,
// lib/geo.ts, lib/entregadores.ts, lib/fidelidade.ts, lib/garantia.ts,
// lib/exclusaoConta.ts). Nada aqui é lido do banco: a página é estática.
//
// `id` é o âncora do link compartilhável (/suporte#taxa-entrega) — renomear
// quebra links já enviados a clientes; título e texto são livres.
// ============================================================================

import { PRECO_NORMAL, PRECO_FUNDADOR, VAGAS_FUNDADOR, DESCONTO_MAX, brl } from './precos'
import { RAIO_BUSCA_KM, TEMPO_RESPOSTA_CORRIDA_S } from './entregadores'
import { PONTOS_POR_REAL, PONTOS_POR_BLOCO, DESCONTO_POR_BLOCO } from './fidelidade'
import { TOLERANCIA_MIN, DESCONTO_PCT, VALIDADE_DIAS } from './garantia'
import { CARENCIA_DIAS } from './exclusaoConta'
import { REGRA_DINHEIRO } from './acertos'
import { CONTATO } from './legal'

export type Publico = 'comerciante' | 'cliente' | 'entregador' | 'fornecedor'

export type PerguntaFaq = {
  id: string
  pergunta: string
  /** Texto corrido; parágrafos separados por "\n\n". */
  resposta: string
  /** Termos que o usuário digitaria e que não aparecem no texto (sinônimos, gírias). */
  tags?: string[]
  /** Para quem a pergunta faz sentido — usado como filtro rápido. */
  publico: Publico[]
  /** Leva à tela onde a pessoa resolve sozinha. */
  link?: { label: string; href: string }
}

export type CategoriaFaq = {
  id: string
  nome: string
  descricao: string
  perguntas: PerguntaFaq[]
}

export const PUBLICOS: { valor: Publico; label: string }[] = [
  { valor: 'comerciante', label: 'Sou comerciante' },
  { valor: 'cliente', label: 'Sou cliente' },
  { valor: 'entregador', label: 'Sou entregador' },
  { valor: 'fornecedor', label: 'Sou fornecedor' },
]

export const CATEGORIAS_FAQ: CategoriaFaq[] = [
  {
    id: 'conta',
    nome: 'Conta e cadastro',
    descricao: 'Criar conta, entrar, senha e tipos de perfil.',
    perguntas: [
      {
        id: 'como-criar-conta',
        pergunta: 'Como crio minha conta?',
        resposta:
          'Na tela de entrada, escolha o seu perfil (comerciante, cliente, entregador ou fornecedor) e cadastre-se com e-mail e senha ou com a conta Google. No cadastro por e-mail você recebe um código de confirmação — digite-o para concluir.\n\nDepois disso o app faz um onboarding curto: o comerciante informa os dados da loja e o tipo de negócio, o entregador envia documento e veículo, o cliente só confirma nome e telefone.',
        tags: ['cadastro', 'registrar', 'criar conta', 'sign up'],
        publico: ['comerciante', 'cliente', 'entregador', 'fornecedor'],
        link: { label: 'Ir para a tela de entrada', href: '/entrar' },
      },
      {
        id: 'codigo-nao-chega',
        pergunta: 'O código de confirmação não chegou no meu e-mail. E agora?',
        resposta:
          'Confira a caixa de spam e a pasta "Promoções". O envio pode levar alguns minutos em horários de pico. Se passar de 10 minutos, volte à tela de entrada e peça um novo código — o anterior é invalidado.\n\nSe preferir, use "Entrar com Google": não depende de e-mail de confirmação.',
        tags: ['otp', 'email nao chega', 'verificacao', 'confirmar email'],
        publico: ['comerciante', 'cliente', 'entregador', 'fornecedor'],
        link: { label: 'Tentar de novo', href: '/entrar' },
      },
      {
        id: 'esqueci-senha',
        pergunta: 'Esqueci minha senha. Como recupero?',
        resposta:
          'Use "Esqueci minha senha" na tela de login e informe o e-mail cadastrado. Você recebe um link para definir uma senha nova. O link vale por pouco tempo — se expirar, peça outro.\n\nQuem entrou com o Google não tem senha na Commerly: basta clicar em "Entrar com Google" de novo.',
        tags: ['recuperar senha', 'redefinir', 'trocar senha', 'nova senha'],
        publico: ['comerciante', 'cliente', 'entregador', 'fornecedor'],
        link: { label: 'Recuperar senha', href: '/recuperar-senha' },
      },
      {
        id: 'entrei-google-sem-loja',
        pergunta: 'Entrei com o Google e o app diz que não tenho loja ou perfil. Por quê?',
        resposta:
          'O login com Google cria a conta, mas ainda não diz qual é o seu perfil. Se você é comerciante, siga o onboarding para cadastrar a loja; se é cliente, entregador ou fornecedor, entre pela página do seu perfil (por exemplo, /cliente/login) — o app reconhece a mesma conta Google e completa o cadastro certo.',
        tags: ['google', 'sem loja', 'perfil errado'],
        publico: ['comerciante', 'cliente', 'entregador', 'fornecedor'],
      },
      {
        id: 'um-email-um-perfil',
        pergunta: 'Posso usar o mesmo e-mail como comerciante e como cliente?',
        resposta:
          'Não. Cada conta tem um único perfil: comerciante, cliente, entregador ou fornecedor. Para atuar em dois papéis, crie contas com e-mails diferentes.\n\nO mesmo vale para CPF e CNPJ: cada documento só pode estar em uma loja.',
        tags: ['dois perfis', 'mesma conta', 'cpf duplicado', 'cnpj duplicado'],
        publico: ['comerciante', 'cliente', 'entregador', 'fornecedor'],
      },
      {
        id: 'mais-de-uma-loja',
        pergunta: 'Posso ter mais de uma loja na mesma conta?',
        resposta:
          'Hoje cada conta de comerciante corresponde a uma loja. Para uma segunda loja, crie outra conta com outro e-mail e outro CNPJ (ou CPF).',
        tags: ['filial', 'segunda loja', 'multiplas lojas'],
        publico: ['comerciante'],
      },
      {
        id: 'cpf-ja-cadastrado',
        pergunta: 'O cadastro diz que meu CPF, CNPJ ou telefone já está em uso.',
        resposta:
          'Cada documento e cada telefone só podem estar em um cadastro. Provavelmente você já criou uma conta antes — tente entrar com "Esqueci minha senha" ou com o Google no e-mail que usou na época.\n\nSe tem certeza de que nunca se cadastrou, fale com o suporte pelo formulário no fim desta página informando o documento (só os últimos dígitos) para investigarmos.',
        tags: ['documento em uso', 'ja existe', 'duplicado'],
        publico: ['comerciante', 'cliente', 'entregador', 'fornecedor'],
      },
      {
        id: 'sair-da-conta',
        pergunta: 'Como saio da conta ou troco de conta?',
        resposta:
          'No painel, o menu lateral (ou o menu do perfil, no celular) tem a opção "Sair". Depois de sair, entre com a outra conta pela página do perfil correspondente.',
        tags: ['logout', 'deslogar', 'trocar conta'],
        publico: ['comerciante', 'cliente', 'entregador', 'fornecedor'],
      },
    ],
  },
  {
    id: 'planos',
    nome: 'Planos e assinatura',
    descricao: 'Período de teste, preço, cancelamento e descontos.',
    perguntas: [
      {
        id: 'quanto-custa',
        pergunta: 'Quanto custa a Commerly?',
        resposta:
          `A assinatura do comerciante custa ${brl(PRECO_NORMAL)} por mês, sem fidelidade. Os ${VAGAS_FUNDADOR} primeiros comerciantes (programa Fundadores) pagam ${brl(PRECO_FUNDADOR)} por mês, preço travado para sempre.\n\nPara clientes e entregadores o uso é gratuito. Fornecedores também não pagam mensalidade.`,
        tags: ['preco', 'valor', 'mensalidade', 'assinatura', 'plano'],
        publico: ['comerciante'],
        link: { label: 'Ver planos', href: '/planos' },
      },
      {
        id: 'periodo-de-teste',
        pergunta: 'Tem período de teste? Preciso cadastrar cartão?',
        resposta:
          'Sim: toda loja nova tem 3 dias de teste com o painel completo, sem cadastrar cartão. O prazo aparece no topo do painel. Para continuar depois disso, assine em "Planos".\n\nO teste é único por documento (CPF/CNPJ): excluir a conta e criar outra não reinicia o prazo.',
        tags: ['trial', 'gratis', 'teste gratuito', 'experimentar'],
        publico: ['comerciante'],
        link: { label: 'Assinar', href: '/planos' },
      },
      {
        id: 'como-pagar-assinatura',
        pergunta: 'Como pago a assinatura?',
        resposta:
          'Com cartão de crédito, pela Stripe. A cobrança é mensal e automática. As faturas de cada mês (com PDF) ficam em Configurações → "Faturas". Para trocar o cartão, cancele e assine de novo com o cartão novo — o acesso não é interrompido.',
        tags: ['cartao', 'boleto', 'pix mensalidade', 'fatura', 'stripe', 'trocar cartao'],
        publico: ['comerciante'],
        link: { label: 'Ver faturas', href: '/configuracoes' },
      },
      {
        id: 'cancelar-assinatura',
        pergunta: 'Como cancelo minha assinatura?',
        resposta:
          'Em "Planos", clique em "Cancelar assinatura". Não há multa nem fidelidade: o acesso continua até o fim do período já pago e, depois, a cobrança para sozinha. Os dados da loja ficam guardados — se voltar a assinar, tudo está no lugar.',
        tags: ['cancelamento', 'parar de pagar', 'encerrar plano'],
        publico: ['comerciante'],
        link: { label: 'Ir para Planos', href: '/planos' },
      },
      {
        id: 'plano-vencido',
        pergunta: 'O que acontece quando o plano vence?',
        resposta:
          'O painel fica bloqueado até você assinar de novo, e a loja deixa de aparecer para os clientes na busca e no cardápio online. As integrações (Mercado Pago, PagBank, IA, Ads) ficam pausadas, mas continuam conectadas.\n\nNada é apagado. Assim que a assinatura volta, tudo reaparece.',
        tags: ['bloqueado', 'expirou', 'acesso negado', 'loja sumiu'],
        publico: ['comerciante'],
        link: { label: 'Regularizar', href: '/planos' },
      },
      {
        id: 'desconto-indicacao',
        pergunta: 'Como funciona o desconto por indicação?',
        resposta:
          `Cada comerciante indicado por você que assinar dá 10% de desconto permanente na sua mensalidade, até ${DESCONTO_MAX}% (quatro indicações). Quem entra pelo seu convite também ganha, na primeira assinatura, o mesmo percentual que você tinha na hora.\n\nSeu link de convite fica no painel, no card "Indique e ganhe".`,
        tags: ['indicar', 'convite', 'referral', 'cupom de amigo'],
        publico: ['comerciante'],
        link: { label: 'Ver meu link no painel', href: '/dashboard' },
      },
      {
        id: 'commerly-ads',
        pergunta: 'O que é o Commerly Ads?',
        resposta:
          'Uma assinatura mensal opcional que coloca sua loja no topo da busca dos clientes, com um selo de destaque. Cancela quando quiser; o destaque vale até o fim do período pago.',
        tags: ['destaque', 'anuncio', 'topo da busca', 'impulsionar'],
        publico: ['comerciante'],
        link: { label: 'Conhecer o Ads', href: '/ads' },
      },
    ],
  },
  {
    id: 'pedidos',
    nome: 'Pedidos',
    descricao: 'Acompanhar, cancelar, código de entrega e atrasos.',
    perguntas: [
      {
        id: 'acompanhar-pedido',
        pergunta: 'Como acompanho meu pedido?',
        resposta:
          'Em "Meus pedidos" você vê cada etapa: recebido → preparando → saiu para entrega → entregue. Quando o entregador sai, aparece a localização dele no mapa em tempo real e o tempo estimado.\n\nVocê também recebe notificações a cada mudança de status.',
        tags: ['status', 'rastrear', 'onde esta meu pedido', 'acompanhamento'],
        publico: ['cliente'],
        link: { label: 'Meus pedidos', href: '/cliente/pedidos' },
      },
      {
        id: 'cancelar-pedido-cliente',
        pergunta: 'Posso cancelar um pedido?',
        resposta:
          'Sim, enquanto a loja ainda não começou a preparar (status "recebido"). Depois disso, só a loja consegue cancelar — fale com ela pelo chat do pedido.\n\nSe você pagou online, o estorno é automático e integral no cancelamento.',
        tags: ['desistir', 'cancelamento', 'estorno'],
        publico: ['cliente'],
        link: { label: 'Meus pedidos', href: '/cliente/pedidos' },
      },
      {
        id: 'codigo-de-entrega',
        pergunta: 'O que é o código de entrega?',
        resposta:
          'Um código de 4 dígitos que aparece no seu pedido quando ele sai para entrega. Informe-o ao entregador na hora de receber: só com ele o pedido é marcado como entregue. Não passe o código antes de estar com o pedido na mão.',
        tags: ['codigo confirmacao', 'senha do pedido', 'pin'],
        publico: ['cliente', 'entregador'],
      },
      {
        id: 'pedido-atrasado',
        pergunta: 'Meu pedido está atrasado. O que faço?',
        resposta:
          `Primeiro fale com a loja pelo chat — quase sempre é preparo ou trânsito. Se o pedido passar mais de ${TOLERANCIA_MIN} minutos do horário previsto, a Commerly Garantia registra o atraso e você recebe uma notificação com um cupom de ${DESCONTO_PCT}% válido por ${VALIDADE_DIAS} dias. O cupom é usado no Modo Festa: quem cria a festa escolhe o cupom antes de fechar e o desconto é dividido entre os pedidos das lojas que aceitam cupom.`,
        tags: ['demora', 'atraso', 'garantia', 'cupom'],
        publico: ['cliente'],
      },
      {
        id: 'cupom-onde-usar',
        pergunta: 'Ganhei um cupom. Onde eu uso?',
        resposta:
          'No Modo Festa. Ao fechar uma festa que você criou, os seus cupons válidos aparecem em "Usar cupom" com uma prévia do desconto. O valor é dividido entre os pedidos de todos os participantes, na proporção do valor de cada pedido, e só nas lojas com o selo "Aceita cupom" — se alguma loja da festa não aceita, o desconto fica menor e o app avisa antes de fechar. Um cupom de loja ("sentimos sua falta") só vale nos pedidos daquela loja.\n\nSe todos os pedidos que receberam o desconto forem cancelados, o cupom volta para você com a validade estendida pelo tempo que ficou preso.',
        tags: ['cupom', 'desconto', 'festa', 'aceita cupom', 'como usar cupom'],
        publico: ['cliente'],
        link: { label: 'Abrir Modo Festa', href: '/cliente/festa' },
      },
      {
        id: 'pedido-nao-apareceu',
        pergunta: 'Fiz um pedido e ele não apareceu no painel da loja.',
        resposta:
          'Pedidos pagos online só são criados depois que o pagamento é confirmado — no Pix isso pode levar alguns minutos. Pedidos com pagamento na entrega aparecem na hora.\n\nSe o pagamento foi aprovado e o pedido não apareceu em 10 minutos, mande para o suporte o horário, o valor e o nome da loja.',
        tags: ['pedido sumiu', 'nao recebi o pedido', 'pagamento confirmado'],
        publico: ['comerciante', 'cliente'],
      },
      {
        id: 'loja-fechada',
        pergunta: 'O app diz que a loja está fechada, mas ela está aberta.',
        resposta:
          'O app usa o horário de funcionamento que a loja cadastrou em Configurações (no formato "08:00 - 18:00", com fuso de Brasília). Fora desse horário o pedido é recusado. Se você é o comerciante, ajuste o horário; se é cliente, avise a loja.',
        tags: ['horario', 'fora do horario', 'fechado', 'nao aceita pedido'],
        publico: ['comerciante', 'cliente'],
        link: { label: 'Configurações da loja', href: '/configuracoes' },
      },
      {
        id: 'avaliar-pedido',
        pergunta: 'Como avalio a loja e o entregador?',
        resposta:
          'Depois que o pedido é marcado como entregue, aparece a opção de avaliar em "Meus pedidos". A avaliação é separada para a loja e para o entregador e fica ligada àquele pedido — só quem recebeu pode avaliar.',
        tags: ['nota', 'estrelas', 'review', 'reclamar'],
        publico: ['cliente'],
        link: { label: 'Meus pedidos', href: '/cliente/pedidos' },
      },
      {
        id: 'modo-festa',
        pergunta: 'O que é o Modo Festa?',
        resposta:
          'Um pedido em grupo: você monta um carrinho com até três lojas diferentes e tudo chega no mesmo endereço, numa entrega só. A taxa de entrega é dividida entre as lojas.',
        tags: ['pedido em grupo', 'varias lojas', 'festa'],
        publico: ['cliente'],
        link: { label: 'Abrir Modo Festa', href: '/cliente/festa' },
      },
      {
        id: 'cancelar-pedido-loja',
        pergunta: 'Como cancelo um pedido como loja? O cliente é estornado?',
        resposta:
          'Em "Pedidos", abra o pedido e use "Cancelar". Se o cliente pagou online, o estorno integral é feito automaticamente no mesmo cartão ou Pix — você não precisa fazer nada. Cancele antes de começar o preparo sempre que possível: cancelar com o entregador a caminho custa a corrida.',
        tags: ['cancelamento loja', 'estornar cliente', 'devolver dinheiro'],
        publico: ['comerciante'],
        link: { label: 'Meus pedidos', href: '/pedidos' },
      },
    ],
  },
  {
    id: 'pagamento',
    nome: 'Pagamento',
    descricao: 'Formas de pagar, estornos e recebimento da loja.',
    perguntas: [
      {
        id: 'formas-de-pagamento',
        pergunta: 'Quais formas de pagamento posso usar no pedido?',
        resposta:
          'Online, com cartão de crédito ou Pix, na hora de fechar o pedido; ou na entrega, em dinheiro ou Pix direto com o entregador. Se for pagar em dinheiro, marque "Preciso de troco" e diga com que nota vai pagar — o entregador já sai com o troco certo. A forma escolhida aparece para a loja e para o entregador.',
        tags: ['pix', 'cartao', 'dinheiro', 'troco', 'pagar na entrega'],
        publico: ['cliente'],
      },
      {
        id: 'pagamento-em-dinheiro',
        pergunta: 'Como funciona o pagamento em dinheiro na entrega?',
        resposta:
          REGRA_DINHEIRO + '\n\nSem entregador (a loja mesma entregou), ela recebe direto do cliente e o pedido já fica como pago ao ser marcado como entregue.',
        tags: ['dinheiro', 'troco', 'repasse', 'quem fica com a taxa', 'acerto', 'na entrega'],
        publico: ['cliente', 'comerciante', 'entregador'],
      },
      {
        id: 'estorno-prazo',
        pergunta: 'Fui estornado. Quando o dinheiro volta?',
        resposta:
          'O estorno sai da Commerly na hora do cancelamento. No Pix ele costuma cair no mesmo dia; no cartão de crédito aparece como crédito na fatura, o que pode levar até dois ciclos dependendo do banco. Se passar disso, fale com o suporte com o número do pedido.',
        tags: ['reembolso', 'devolucao', 'chargeback', 'quando volta'],
        publico: ['cliente'],
      },
      {
        id: 'receber-pagamentos-online',
        pergunta: 'Como recebo os pagamentos online dos pedidos?',
        resposta:
          'Conecte sua conta em "Integrações" → Stripe. O valor dos produtos é repassado para a sua conta a cada pedido pago online; a taxa de entrega vai para o entregador. Sem a conta conectada, os clientes só conseguem pagar na entrega — nesse caso o entregador cobra na porta e repassa o valor dos produtos a você (veja "Como funciona o pagamento em dinheiro").',
        tags: ['stripe', 'connect', 'repasse', 'saque', 'receber'],
        publico: ['comerciante'],
        link: { label: 'Abrir Integrações', href: '/integracoes' },
      },
      {
        id: 'taxas-sobre-pedido',
        pergunta: 'A Commerly cobra comissão sobre os pedidos?',
        resposta:
          'Não. A mensalidade é o único custo da plataforma: a loja recebe o valor integral dos produtos, a taxa de entrega vai para o entregador e as tarifas do processador de pagamento ficam por conta da Commerly. Em pedidos pagos na entrega o dinheiro não passa pela Commerly — o entregador repassa o valor dos produtos direto a você e o acerto fica registrado em "Pedidos" para os dois lados verem a mesma conta.',
        tags: ['comissao', 'porcentagem', 'taxa da plataforma'],
        publico: ['comerciante'],
      },
      {
        id: 'mercado-pago-pagbank',
        pergunta: 'Para que servem as integrações com Mercado Pago e PagBank?',
        resposta:
          'Para trazer as vendas da sua maquininha ou link de pagamento para o painel, sem digitar nada. Conecte em "Integrações"; as vendas sincronizadas entram no histórico e no Financeiro.',
        tags: ['maquininha', 'integrar', 'sincronizar vendas'],
        publico: ['comerciante'],
        link: { label: 'Abrir Integrações', href: '/integracoes' },
      },
    ],
  },
  {
    id: 'delivery',
    nome: 'Delivery',
    descricao: 'Cobertura, taxa de entrega, despacho e configuração da loja.',
    perguntas: [
      {
        id: 'cidades-com-delivery',
        pergunta: 'O delivery está disponível na minha cidade?',
        resposta:
          'O delivery com entregadores da Commerly está sendo aberto cidade a cidade e hoje funciona em Goiânia (GO). Nas demais cidades o painel de gestão, o cardápio digital e o pedido pelo WhatsApp funcionam normalmente — só a entrega pela plataforma ainda não.\n\nQuando a sua cidade abrir, a loja recebe um aviso no painel.',
        tags: ['cobertura', 'minha cidade', 'expansao', 'goiania', 'nao atende'],
        publico: ['comerciante', 'cliente', 'entregador'],
        link: { label: 'Ver expansão', href: '/expansao' },
      },
      {
        id: 'taxa-entrega',
        pergunta: 'Como a taxa de entrega é calculada?',
        resposta:
          'Pela distância em linha reta entre a loja e o endereço do cliente: R$ 3,00 fixos + R$ 1,00 por km, com mínimo de R$ 3,00 e máximo de R$ 25,00. Nas noites de sexta, sábado e domingo (18h às 22h) há um acréscimo de 30%.\n\nA taxa vai integralmente para o entregador: via Stripe quando o pedido é pago online, ou retida do que ele cobra na porta quando é pago em dinheiro.',
        tags: ['frete', 'valor da entrega', 'quanto custa entrega', 'pico'],
        publico: ['cliente', 'comerciante', 'entregador'],
      },
      {
        id: 'taxa-errada',
        pergunta: 'A taxa de entrega está saindo errada ou sempre no mínimo.',
        resposta:
          'Quase sempre a loja está sem coordenadas. A distância é medida a partir da localização da loja: se o endereço não foi localizado no mapa, a taxa cai no valor mínimo. Em Configurações, confira o endereço e use "Localizar no mapa" para gravar as coordenadas.',
        tags: ['taxa minima', 'frete errado', 'coordenadas', 'localizacao da loja'],
        publico: ['comerciante'],
        link: { label: 'Configurações da loja', href: '/configuracoes' },
      },
      {
        id: 'como-funciona-despacho',
        pergunta: 'Como o entregador é escolhido para o pedido?',
        resposta:
          `Quando a loja marca o pedido como pronto (ou usa "Buscar entregador"), a Commerly oferece a corrida ao entregador online mais próximo, num raio de ${RAIO_BUSCA_KM} km. Ele tem ${TEMPO_RESPOSTA_CORRIDA_S} segundos para aceitar; se recusar ou não responder, a oferta passa para o próximo. A loja acompanha tudo na tela do pedido.`,
        tags: ['despacho', 'buscar entregador', 'oferta de corrida', 'ninguem aceita'],
        publico: ['comerciante', 'entregador'],
      },
      {
        id: 'nenhum-entregador',
        pergunta: 'Nenhum entregador aceitou meu pedido. O que fazer?',
        resposta:
          `Não havia entregador online a até ${RAIO_BUSCA_KM} km da loja, ou todos estavam ocupados. Toque em "Buscar entregador" de novo alguns minutos depois — a busca recomeça do zero. Enquanto isso, você pode entregar com equipe própria e avançar o status manualmente.`,
        tags: ['sem entregador', 'esgotado', 'ninguem pegou'],
        publico: ['comerciante'],
        link: { label: 'Meus pedidos', href: '/pedidos' },
      },
      {
        id: 'area-e-tempo-de-preparo',
        pergunta: 'Onde defino a área de entrega e o tempo de preparo?',
        resposta:
          'Em Configurações → Delivery: a distância máxima que você atende (em km) e o tempo médio de preparo (em minutos). O tempo de preparo entra na previsão que o cliente vê; a distância máxima esconde a loja de quem está longe demais.\n\nDica: comece com uma área menor e amplie conforme der conta do movimento.',
        tags: ['raio de entrega', 'distancia maxima', 'tempo de preparo', 'area'],
        publico: ['comerciante'],
        link: { label: 'Configurações da loja', href: '/configuracoes' },
      },
      {
        id: 'loja-nao-aparece',
        pergunta: 'Minha loja não aparece para os clientes na busca.',
        resposta:
          'Confira, nesta ordem: (1) o plano está em dia; (2) a loja tem cidade e endereço localizados no mapa em Configurações; (3) está dentro do horário de funcionamento; (4) o delivery já abriu na sua cidade. Qualquer um desses itens tira a loja da busca. O painel mostra um aviso no topo quando é o caso da cidade.',
        tags: ['invisivel', 'nao encontro minha loja', 'sumiu da busca', 'vitrine'],
        publico: ['comerciante'],
        link: { label: 'Configurações da loja', href: '/configuracoes' },
      },
    ],
  },
  {
    id: 'loja-online',
    nome: 'Cardápio e loja online',
    descricao: 'Cardápio digital, QR code, WhatsApp, produtos e promoções.',
    perguntas: [
      {
        id: 'cardapio-digital',
        pergunta: 'Como divulgo meu cardápio digital?',
        resposta:
          'Todo produto cadastrado entra automaticamente no seu cardápio público. Em Configurações você encontra o link e o QR code para imprimir e colocar na mesa, no balcão ou na embalagem. O cliente abre sem instalar nada e pode pedir direto.',
        tags: ['qr code', 'link do cardapio', 'menu digital', 'imprimir'],
        publico: ['comerciante'],
        link: { label: 'Pegar meu QR code', href: '/configuracoes' },
      },
      {
        id: 'pedir-pelo-whatsapp',
        pergunta: 'Como ativo o botão "Pedir pelo WhatsApp"?',
        resposta:
          'Cadastre o número do WhatsApp da loja em Configurações. O botão aparece na sua página pública e no cardápio digital, e o cliente chega na sua conversa com o pedido já montado. Funciona em qualquer cidade, mesmo onde o delivery da Commerly ainda não abriu.',
        tags: ['whatsapp', 'zap', 'numero', 'pedido por mensagem'],
        publico: ['comerciante'],
        link: { label: 'Configurar WhatsApp', href: '/configuracoes' },
      },
      {
        id: 'foto-produto-nao-sobe',
        pergunta: 'A foto do produto não carrega ou dá erro no upload.',
        resposta:
          'Use JPG ou PNG de até alguns MB e tente de novo com boa conexão. Se persistir, mande para o suporte o nome do produto e uma captura do erro — pode ser um problema do nosso lado.\n\nEnquanto isso, a Academy tem uma aula rápida sobre como tirar fotos que vendem.',
        tags: ['imagem', 'upload', 'erro na foto', 'nao salva a foto'],
        publico: ['comerciante'],
        link: { label: 'Aula: foto de produto', href: '/academy' },
      },
      {
        id: 'estoque-automatico',
        pergunta: 'O estoque baixa sozinho quando vendo?',
        resposta:
          'Sim. Cada venda registrada no painel e cada pedido online descontam a quantidade dos produtos. Produtos com estoque zerado continuam no cardápio marcados como indisponíveis. Ajuste o estoque manualmente em Produtos quando receber mercadoria.',
        tags: ['estoque', 'quantidade', 'indisponivel', 'esgotado'],
        publico: ['comerciante'],
        link: { label: 'Meus produtos', href: '/produtos' },
      },
      {
        id: 'promocoes-combos',
        pergunta: 'Como crio promoções e combos?',
        resposta:
          'Promoções (desconto por produto ou período, incluindo ofertas-relâmpago) ficam em "Promoções"; combos, em "Combos" — o app sugere combos a partir do que os clientes já compram junto. O preço promocional vale no cardápio e no pedido online automaticamente.\n\nAntes de anunciar um desconto, confira se ele cabe na margem do produto — a Academy explica a conta.',
        tags: ['desconto', 'cupom', 'combo', 'oferta', 'flash sale'],
        publico: ['comerciante'],
        link: { label: 'Abrir Promoções', href: '/promocoes' },
      },
      {
        id: 'cupom-modo-festa-loja',
        pergunta: 'O que é "Aceito cupom no Modo Festa" e quem paga o desconto?',
        resposta:
          'É um interruptor em Configurações > Delivery avançado (desligado por padrão). Ligado, sua loja aparece com o selo "Aceita cupom" para quem monta uma festa e entra no rateio do desconto — pedidos em grupo costumam ser maiores. Você só absorve o desconto dos cupons que você mesma enviou pela campanha "sentimos sua falta"; ele sai do valor do pedido, como no Clube de pontos. O cupom da Commerly Garantia (atraso na entrega) é bancado pela Commerly, não pela loja. Nos dois casos o abatimento aparece na linha "Cupom" do pedido.',
        tags: ['cupom', 'aceita cupom', 'modo festa', 'quem paga', 'desconto'],
        publico: ['comerciante'],
        link: { label: 'Abrir Configurações', href: '/configuracoes' },
      },
      {
        id: 'assistente-ia',
        pergunta: 'O que o Assistente e o Copilot de IA fazem?',
        resposta:
          'Respondem perguntas sobre a sua loja ("qual produto vendeu mais este mês?", "onde estou gastando mais?") e sugerem ações. Eles trabalham com números agregados do seu painel — faturamento, produtos, estoque, gastos — mais o texto da sua pergunta. Não envie dados pessoais de terceiros nas perguntas.',
        tags: ['ia', 'inteligencia artificial', 'copilot', 'chat'],
        publico: ['comerciante'],
        link: { label: 'Abrir o Assistente', href: '/assistente' },
      },
    ],
  },
  {
    id: 'entregadores',
    nome: 'Entregadores',
    descricao: 'Cadastro, corridas, GPS e repasse.',
    perguntas: [
      {
        id: 'cadastro-entregador',
        pergunta: 'O que preciso para ser entregador?',
        resposta:
          'Ser maior de idade, ter CPF, um documento com foto, um veículo (bicicleta, moto, carro ou a pé) e uma bolsa térmica para transportar os pedidos. No cadastro você envia uma foto do rosto, do documento e da bolsa. Para moto e carro, informe a CNH.',
        tags: ['requisitos', 'documentos', 'cnh', 'bolsa termica', 'virar entregador'],
        publico: ['entregador'],
        link: { label: 'Cadastrar-me', href: '/entregador-delivery/login' },
      },
      {
        id: 'nao-recebo-corridas',
        pergunta: 'Por que não recebo corridas?',
        resposta:
          `Três condições precisam estar verdadeiras ao mesmo tempo: você está "online" no app, o GPS está ativo e atualizando (a permissão de localização precisa estar liberada), e há pedidos de lojas a até ${RAIO_BUSCA_KM} km de você. A oferta chega como notificação e vale ${TEMPO_RESPOSTA_CORRIDA_S} segundos.\n\nMantenha o app aberto: com a tela bloqueada por muito tempo, alguns celulares interrompem o GPS.`,
        tags: ['sem corrida', 'nao aparece pedido', 'offline', 'gps'],
        publico: ['entregador'],
        link: { label: 'Meu painel', href: '/entregador-delivery/dashboard' },
      },
      {
        id: 'duas-entregas',
        pergunta: 'Posso levar dois pedidos ao mesmo tempo?',
        resposta:
          'Sim. Quando houver um segundo pedido de uma loja próxima com entrega na mesma direção, aparece a opção "Aceitar junto" no seu painel. A rota é reordenada automaticamente. O limite é de dois pedidos por viagem.',
        tags: ['multi entrega', 'aceitar junto', 'lote'],
        publico: ['entregador'],
      },
      {
        id: 'repasse-entregador',
        pergunta: 'Quando e como recebo pelas corridas?',
        resposta:
          'Depende de como o cliente pagou. Pedido pago online: conecte sua conta bancária em "Recebimentos" (Stripe) no painel; a taxa de entrega é repassada após a confirmação da entrega pelo código do cliente. Pedido em dinheiro: você cobra o total na porta, fica com a taxa de entrega na hora e repassa o valor dos produtos à loja — ela confirma o repasse no painel e você acompanha no seu histórico. Antes de aceitar a corrida, a oferta já mostra se é em dinheiro, quanto cobrar e quanto troco levar.',
        tags: ['pagamento', 'saque', 'ganhos', 'stripe', 'quanto ganho', 'dinheiro', 'troco', 'repasse'],
        publico: ['entregador'],
        link: { label: 'Meu painel', href: '/entregador-delivery/dashboard' },
      },
      {
        id: 'gps-perdido',
        pergunta: 'Fiquei sem sinal de GPS durante a entrega. O que acontece?',
        resposta:
          'Depois de alguns minutos sem localização, o app pergunta se você ainda está com o pedido. Responda para manter a corrida. Se não houver resposta, o pedido é liberado para outro entregador — por isso mantenha a localização ligada e o app em primeiro plano.',
        tags: ['perdi sinal', 'localizacao', 'corrida liberada', 'pedido sumiu'],
        publico: ['entregador'],
      },
      {
        id: 'bolsa-termica-obrigatoria',
        pergunta: 'A bolsa térmica é obrigatória? Preciso comprar da Commerly?',
        resposta:
          'A bolsa é obrigatória em todas as entregas, mas pode ser de qualquer marca. A Commerly oferece um kit próprio como conveniência, não como exigência — sem ele você recebe corridas normalmente.',
        tags: ['kit', 'mochila', 'bag', 'equipamento'],
        publico: ['entregador'],
        link: { label: 'Ver o kit', href: '/kit' },
      },
    ],
  },
  {
    id: 'clube',
    nome: 'Clube de pontos',
    descricao: 'Como ganhar, resgatar e onde os pontos valem.',
    perguntas: [
      {
        id: 'como-ganhar-pontos',
        pergunta: 'Como ganho pontos?',
        resposta:
          `Você ganha ${PONTOS_POR_REAL} ponto por real gasto em produtos (a taxa de entrega não pontua). Os pontos entram quando o pedido é marcado como entregue. Se o pedido for cancelado, os pontos daquele pedido são estornados.`,
        tags: ['pontos', 'fidelidade', 'acumular', 'clube'],
        publico: ['cliente'],
        link: { label: 'Meu Clube', href: '/cliente/clube' },
      },
      {
        id: 'resgatar-pontos',
        pergunta: 'Como uso meus pontos?',
        resposta:
          `Na hora de fechar um pedido, escolha quantos blocos de ${PONTOS_POR_BLOCO} pontos quer usar: cada bloco vale ${brl(DESCONTO_POR_BLOCO)} de desconto. O desconto nunca passa do valor dos produtos.`,
        tags: ['resgate', 'trocar pontos', 'desconto com pontos'],
        publico: ['cliente'],
      },
      {
        id: 'onde-pontos-valem',
        pergunta: 'Onde meus pontos valem?',
        resposta:
          'Em qualquer loja da plataforma. O saldo é único, não importa em qual loja você acumulou.',
        tags: ['todas as lojas', 'rede'],
        publico: ['cliente'],
      },
      {
        id: 'clube-para-loja',
        pergunta: 'Sou comerciante. O Clube custa alguma coisa para mim?',
        resposta:
          'Não há mensalidade extra: o Clube está incluído no plano. Quando um cliente resgata pontos, o desconto sai do valor daquele pedido — a loja recebe o valor já com o desconto, como numa promoção. Em troca, quem tem pontos acumulados tem um motivo a mais para escolher você.',
        tags: ['custo do clube', 'quem paga os pontos'],
        publico: ['comerciante'],
        link: { label: 'Meus clientes', href: '/clientes' },
      },
    ],
  },
  {
    id: 'fornecedores',
    nome: 'Fornecedores (B2B)',
    descricao: 'Compras da loja com fornecedores da plataforma.',
    perguntas: [
      {
        id: 'comprar-de-fornecedor',
        pergunta: 'Como compro de um fornecedor pela Commerly?',
        resposta:
          'Em "Fornecedores", no painel da loja, você vê os catálogos, compara preços e fecha o pedido. O pagamento pode ser online (cartão) ou combinado com o fornecedor. O status do pedido e a conversa ficam em "Mensagens".',
        tags: ['b2b', 'atacado', 'comprar insumo', 'catalogo'],
        publico: ['comerciante'],
        link: { label: 'Ver fornecedores', href: '/fornecedores' },
      },
      {
        id: 'ser-fornecedor',
        pergunta: 'Sou fornecedor. Como vendo para as lojas?',
        resposta:
          'Crie uma conta de fornecedor, cadastre o catálogo com preços e estoque e, se quiser receber online, conecte a Stripe em Configurações. Cada pedido de loja gera uma notificação e uma conversa; você atualiza o status até a entrega.',
        tags: ['fornecedor', 'distribuidor', 'vender para lojas'],
        publico: ['fornecedor'],
        link: { label: 'Painel do fornecedor', href: '/fornecedor/login' },
      },
    ],
  },
  {
    id: 'dados',
    nome: 'Dados e privacidade',
    descricao: 'Exclusão de conta, exportação e o que a IA acessa.',
    perguntas: [
      {
        id: 'excluir-conta',
        pergunta: 'Como excluo minha conta e meus dados?',
        resposta:
          `Logado, vá em Configurações → "Excluir minha conta"; sem acesso ao app, use a página pública de exclusão. A conta é desativada na hora e entra em uma carência de ${CARENCIA_DIAS} dias: se você entrar de novo nesse período, pode reativá-la. Depois disso, os dados são apagados.\n\nAlguns registros fiscais são mantidos pelo prazo legal, e o documento fica guardado de forma irreversível (hash) por 2 anos só para impedir novos períodos de teste.`,
        tags: ['apagar conta', 'deletar', 'lgpd', 'remover dados'],
        publico: ['comerciante', 'cliente', 'entregador', 'fornecedor'],
        link: { label: 'Excluir conta', href: '/excluir-conta' },
      },
      {
        id: 'exportar-dados',
        pergunta: 'Posso baixar uma cópia dos meus dados?',
        resposta:
          'Sim. Na tela de exclusão de conta (Configurações → "Excluir minha conta") há o botão "Baixar meus dados", que gera um arquivo com o seu cadastro, pedidos, vendas e demais registros. Você pode baixar sem concluir a exclusão.',
        tags: ['portabilidade', 'copia dos dados', 'download', 'exportar'],
        publico: ['comerciante', 'cliente', 'entregador', 'fornecedor'],
        link: { label: 'Baixar meus dados', href: '/conta/excluir' },
      },
      {
        id: 'ia-enxerga',
        pergunta: 'O que a IA da Commerly enxerga do meu negócio?',
        resposta:
          'O Assistente e o Copilot enviam dados agregados (faturamento, produtos, estoque, gastos) e o texto da sua pergunta para o modelo de IA. Não enviamos dados pessoais dos seus clientes. Não inclua dados pessoais de terceiros nas perguntas.',
        tags: ['privacidade ia', 'gemini', 'dados enviados'],
        publico: ['comerciante'],
        link: { label: 'Política de Privacidade', href: '/privacidade' },
      },
      {
        id: 'contato-encarregado',
        pergunta: 'Como falo com o encarregado de dados (LGPD)?',
        resposta:
          `Escreva para ${CONTATO.encarregado} com o assunto "LGPD". Pedidos de acesso, correção e exclusão são respondidos em até 15 dias.`,
        tags: ['dpo', 'encarregado', 'lgpd', 'direitos'],
        publico: ['comerciante', 'cliente', 'entregador', 'fornecedor'],
        link: { label: 'Política de Privacidade', href: '/privacidade' },
      },
    ],
  },
]

/** Todas as perguntas, achatadas, com a categoria de cada uma. */
export const PERGUNTAS_FAQ = CATEGORIAS_FAQ.flatMap(c =>
  c.perguntas.map(p => ({ ...p, categoria: c.id, categoriaNome: c.nome })),
)

export type PerguntaComCategoria = (typeof PERGUNTAS_FAQ)[number]

/** Minúsculas, sem acento, sem pontuação — para busca tolerante. */
export function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Busca simples: todo termo digitado (com 2+ letras) precisa aparecer em
 * pergunta, resposta ou tags. Pergunta e tags pesam mais no ranking.
 */
export function buscarFaq(termo: string, itens: PerguntaComCategoria[] = PERGUNTAS_FAQ): PerguntaComCategoria[] {
  const termos = normalizar(termo).split(' ').filter(t => t.length >= 2)
  if (termos.length === 0) return itens

  return itens
    .map(item => {
      const pergunta = normalizar(item.pergunta)
      const tags = normalizar((item.tags || []).join(' '))
      const resposta = normalizar(item.resposta)
      let pontos = 0
      for (const t of termos) {
        if (pergunta.includes(t)) pontos += 3
        else if (tags.includes(t)) pontos += 2
        else if (resposta.includes(t)) pontos += 1
        else return { item, pontos: 0 }
      }
      return { item, pontos }
    })
    .filter(r => r.pontos > 0)
    .sort((a, b) => b.pontos - a.pontos)
    .map(r => r.item)
}
