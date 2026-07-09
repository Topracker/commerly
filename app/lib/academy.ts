// Commerly Academy — mini aulas para o comerciante.
//
// O conteúdo mora aqui, no código: são textos curtos e estáveis, versionados
// junto com as features que eles ensinam. O banco guarda só o PROGRESSO
// (`academy_progresso`), referenciando a aula pelo `slug`.
//
// ⚠️ O `slug` é a chave estrangeira lógica do progresso. Renomear um slug faz o
// comerciante "perder" a aula concluída. Trocar título/texto é livre; slug, não.

export type Topico = {
  titulo: string
  texto: string
}

export type Aula = {
  slug: string
  titulo: string
  descricao: string
  topicos: Topico[]
  /** Leva o comerciante à tela onde ele aplica o que acabou de ler. */
  acao?: { label: string; path: string }
}

export type Categoria = {
  chave: string
  nome: string
  emoji: string
  /** Classes Tailwind do acento da categoria (texto e borda/fundo). */
  cor: string
  aulas: Aula[]
}

/** Palavras por minuto de um leitor adulto lendo na tela, sem pressa. */
const PALAVRAS_POR_MINUTO = 200

/**
 * Tempo estimado de leitura, derivado do próprio texto — assim ele nunca
 * "mente" quando alguém edita uma aula e esquece de atualizar o número.
 */
export function minutosLeitura(aula: Aula): number {
  const texto = [aula.descricao, ...aula.topicos.flatMap(t => [t.titulo, t.texto])].join(' ')
  const palavras = texto.trim().split(/\s+/).length
  return Math.max(1, Math.round(palavras / PALAVRAS_POR_MINUTO))
}

export const CATEGORIAS: Categoria[] = [
  {
    chave: 'financas',
    nome: 'Finanças',
    emoji: '💰',
    cor: 'text-[#6FD98F]',
    aulas: [
      {
        slug: 'preco-certo',
        titulo: 'Como calcular o preço certo',
        descricao: 'Preço não é chute nem cópia do vizinho: é custo, margem e o que o cliente aceita pagar.',
        acao: { label: 'Ver meus produtos', path: '/produtos' },
        topicos: [
          {
            titulo: 'Comece pelo custo real',
            texto: 'Some tudo o que o produto consome até chegar ao cliente: insumos, embalagem, gás, energia e o tempo de quem prepara. É comum o comerciante lembrar só do ingrediente principal e esquecer que a embalagem e o gás também saem do bolso dele.',
          },
          {
            titulo: 'Escolha a margem antes do preço',
            texto: 'Defina quanto quer ganhar sobre o custo — por exemplo, 60%. Um produto que custa R$ 10 e é vendido a R$ 16 tem margem de 60% sobre o custo. Decida a margem primeiro; o preço é consequência da conta, não do palpite.',
          },
          {
            titulo: 'Confira contra o mercado, não obedeça a ele',
            texto: 'Se o preço da conta ficar muito acima do concorrente, o problema costuma ser o custo, não a margem. Baixar o preço para "acompanhar" sem mexer no custo só transfere o prejuízo para você.',
          },
          {
            titulo: 'Revise quando o custo mudar',
            texto: 'Insumo subiu, preço sobe. Deixar para revisar "quando der" é o jeito mais silencioso de trabalhar de graça. Cadastre o preço de custo em Produtos e a Commerly te mostra a margem de cada item.',
          },
        ],
      },
      {
        slug: 'reduzir-desperdicio',
        titulo: 'Como reduzir desperdício',
        descricao: 'Desperdício não aparece no caixa — ele aparece na diferença entre o que você comprou e o que você vendeu.',
        acao: { label: 'Ver meus gastos', path: '/gastos' },
        topicos: [
          {
            titulo: 'Meça antes de cortar',
            texto: 'Por uma semana, anote o que foi jogado fora e por quê: venceu, sobrou pronto, queimou, quebrou. Sem essa lista você corta no lugar errado — quase sempre no item mais visível, não no mais caro.',
          },
          {
            titulo: 'Compre pelo giro, não pela promoção',
            texto: 'Um saco grande mais barato só é mais barato se você vender tudo antes de estragar. Desconto em item de baixo giro é prejuízo com desconto.',
          },
          {
            titulo: 'Use o histórico para prever',
            texto: 'O Histórico mostra o que vendeu em cada dia da semana. Se a terça vende metade do sábado, preparar a mesma quantidade nos dois dias garante sobra na terça.',
          },
          {
            titulo: 'Transforme sobra em promoção, não em lixo',
            texto: 'Item perto do vencimento com desconto ainda paga parte do custo. Item vencido custa o preço inteiro. Crie uma promoção rápida em vez de esperar.',
          },
        ],
      },
      {
        slug: 'lucro-real',
        titulo: 'Entendendo seu lucro real',
        descricao: 'Faturamento é o que entra. Lucro é o que sobra. Confundir os dois é o erro mais caro do pequeno comércio.',
        acao: { label: 'Abrir o Financeiro', path: '/financeiro' },
        topicos: [
          {
            titulo: 'Faturamento não é seu dinheiro',
            texto: 'Vender R$ 20.000 no mês não significa ganhar R$ 20.000. Dali saem os insumos, o aluguel, as taxas de cartão, o imposto e o seu pró-labore. O que sobra depois de tudo é o lucro.',
          },
          {
            titulo: 'Separe custo variável de custo fixo',
            texto: 'Custo variável cresce com a venda (ingrediente, embalagem, taxa da maquininha). Custo fixo não muda se você vender o dobro (aluguel, internet, mensalidade). Saber a diferença mostra quanto cada venda a mais realmente contribui.',
          },
          {
            titulo: 'Descubra seu ponto de equilíbrio',
            texto: 'É quanto você precisa faturar para pagar os custos fixos. Abaixo dele, todo dia trabalhado aumenta o prejuízo. Acima dele, cada venda vira lucro de verdade.',
          },
          {
            titulo: 'Pró-labore é custo, não sobra',
            texto: 'Seu salário precisa estar na conta antes do lucro. Se o negócio só "dá lucro" quando você não se paga, ele ainda não dá lucro. O Financeiro da Commerly já separa entradas, saídas e o DAS do MEI.',
          },
        ],
      },
    ],
  },
  {
    chave: 'marketing',
    nome: 'Marketing',
    emoji: '📱',
    cor: 'text-[#E0632C]',
    aulas: [
      {
        slug: 'foto-de-produto',
        titulo: 'Como tirar foto de produto',
        descricao: 'A foto é a vitrine do delivery. O cliente decide em dois segundos, e ele decide pela imagem.',
        acao: { label: 'Ver meus produtos', path: '/produtos' },
        topicos: [
          {
            titulo: 'Luz natural, sempre',
            texto: 'Fotografe de dia, perto de uma janela, com a luz vindo de lado. Luz de teto achata a comida e deixa tudo amarelado. Nunca use o flash do celular: ele estoura o brilho e apaga a textura.',
          },
          {
            titulo: 'Fundo limpo',
            texto: 'Uma bancada lisa, uma tábua de madeira, um papel branco. Tudo que não é o produto disputa atenção com ele — inclusive a embalagem amassada no canto do quadro.',
          },
          {
            titulo: 'Preencha o quadro',
            texto: 'Chegue perto. O produto deve ocupar quase todo o enquadramento. Foto tirada de longe e depois cortada perde nitidez justamente onde importa.',
          },
          {
            titulo: 'Mesmo estilo em todas',
            texto: 'Mesma luz, mesmo fundo, mesmo ângulo. Um cardápio com fotos parecidas entre si passa profissionalismo mesmo quando cada foto, sozinha, é simples.',
          },
        ],
      },
      {
        slug: 'promocoes-que-vendem',
        titulo: 'Como criar promoções que vendem',
        descricao: 'Promoção boa aumenta o lucro. Promoção ruim aumenta o movimento e diminui o lucro.',
        acao: { label: 'Criar uma promoção', path: '/promocoes' },
        topicos: [
          {
            titulo: 'Desconto tem que caber na margem',
            texto: 'Antes de anunciar 30% off, veja se a margem do produto é maior que 30%. Se não for, cada venda promocional é uma venda no prejuízo — e quanto mais você vende, mais perde.',
          },
          {
            titulo: 'Promova o que tem giro parado',
            texto: 'Dar desconto no campeão de vendas é pagar para vender o que já venderia. Use a promoção para girar o que está encalhado ou perto de vencer.',
          },
          {
            titulo: 'Prazo curto cria urgência',
            texto: 'Promoção sem data de fim vira preço normal. O cliente aprende a esperar o desconto e para de comprar no preço cheio.',
          },
          {
            titulo: 'Meça depois',
            texto: 'Compare o lucro da semana com promoção contra uma semana normal — não o faturamento. É comum faturar mais e lucrar menos.',
          },
        ],
      },
      {
        slug: 'whatsapp-para-vender',
        titulo: 'Como usar o WhatsApp para vender mais',
        descricao: 'O WhatsApp é onde seu cliente já está. O que falta quase sempre é resposta rápida e um caminho curto até o pedido.',
        acao: { label: 'Configurar meu WhatsApp', path: '/configuracoes' },
        topicos: [
          {
            titulo: 'Responda rápido, mesmo que seja para dizer "já te retorno"',
            texto: 'O cliente que não é respondido em minutos abre a conversa do concorrente. Uma resposta curta imediata segura o pedido melhor do que uma resposta completa meia hora depois.',
          },
          {
            titulo: 'Mande o cardápio, não a lista',
            texto: 'Cadastre seu número em Configurações e a Commerly gera o botão "Pedir pelo WhatsApp" na sua página pública e no cardápio digital. O cliente chega na sua conversa com o pedido já começado.',
          },
          {
            titulo: 'Use o status para o que é urgente',
            texto: 'Sobra do dia, prato do almoço, promoção que acaba hoje. O status aparece para quem já é seu cliente — é o público mais barato que existe.',
          },
          {
            titulo: 'Não suma entre um pedido e outro',
            texto: 'Uma mensagem por semana lembra o cliente que você existe. Cinco por dia fazem ele te bloquear. A diferença entre lembrete e spam é a frequência.',
          },
        ],
      },
    ],
  },
  {
    chave: 'crescimento',
    nome: 'Crescimento',
    emoji: '🚀',
    cor: 'text-[#7AA2F7]',
    aulas: [
      {
        slug: 'fidelizar-clientes',
        titulo: 'Como fidelizar clientes',
        descricao: 'Conquistar um cliente novo custa muito mais do que fazer o antigo voltar. Ainda assim, quase todo mundo gasta só na conquista.',
        acao: { label: 'Ver meu CRM', path: '/clientes' },
        topicos: [
          {
            titulo: 'O cliente volta pelo que sentiu, não pelo que comprou',
            texto: 'Pedido certo, no tempo prometido, com a embalagem inteira. O básico bem feito fideliza mais do que qualquer brinde.',
          },
          {
            titulo: 'Chame pelo nome',
            texto: 'A tela de Clientes mostra quem já comprou e o que comprou. Reconhecer o cliente que volta é a forma mais barata de tratamento diferenciado.',
          },
          {
            titulo: 'Recompense a recorrência',
            texto: 'O Clube Commerly dá pontos a cada compra, e os pontos valem em qualquer loja da rede. Quem tem pontos acumulados tem um motivo a mais para escolher você.',
          },
          {
            titulo: 'Vá atrás de quem sumiu',
            texto: 'Um cliente que comprava toda semana e há um mês não aparece não "esqueceu" — ele foi para outro lugar. Uma mensagem antes que o hábito se firme costuma trazê-lo de volta.',
          },
        ],
      },
      {
        slug: 'combos-lucrativos',
        titulo: 'Como criar combos lucrativos',
        descricao: 'Combo bom aumenta o valor do pedido. Combo mal feito só dá desconto no que o cliente já ia levar.',
        acao: { label: 'Ver sugestões de combo', path: '/combos' },
        topicos: [
          {
            titulo: 'Junte o que já vende junto',
            texto: 'A Commerly analisa seus pedidos e mostra quais produtos aparecem na mesma cesta. Combo é para transformar um hábito que já existe em ticket maior.',
          },
          {
            titulo: 'Puxe o item de margem alta',
            texto: 'Bebida e acompanhamento costumam ter margem bem maior que o prato principal. Um combo que empurra a bebida ganha mais do que um que dá desconto no prato.',
          },
          {
            titulo: 'O desconto tem que ser menor que o ganho',
            texto: 'Se o cliente ia gastar R$ 30 e o combo de R$ 38 dá 10% de desconto, você trocou R$ 30 por R$ 34,20. Se ele já ia gastar R$ 40, você perdeu.',
          },
          {
            titulo: 'Poucos combos, bem escolhidos',
            texto: 'Um cardápio com dez combos confunde. Dois ou três, claros, vendem mais do que uma lista que ninguém lê.',
          },
        ],
      },
      {
        slug: 'commerly-score',
        titulo: 'Como analisar seu Commerly Score',
        descricao: 'O Score resume a saúde do negócio em quatro pilares e aponta o mais fraco — que é onde seu próximo esforço rende mais.',
        acao: { label: 'Ver meu Score', path: '/dashboard' },
        topicos: [
          {
            titulo: 'Quatro pilares, 25 pontos cada',
            texto: 'O total vai de 0 a 100. Nenhum pilar sozinho define o negócio: um Score 70 com um pilar em 5 é mais frágil do que um Score 65 equilibrado.',
          },
          {
            titulo: 'Olhe o pilar mais fraco, não o total',
            texto: 'Subir de 20 para 24 num pilar que já vai bem dá quatro pontos e pouca diferença real. Subir de 5 para 15 no pilar fraco muda o negócio.',
          },
          {
            titulo: 'O Score é medida, não meta',
            texto: 'Ele reflete o que você faz: vendas, avaliação, recorrência, operação. Perseguir o número sem mexer na causa não move nada.',
          },
          {
            titulo: 'Compare com você mesmo',
            texto: 'O que importa é a direção ao longo dos meses, não o valor de hoje. Um Score que sobe devagar e sempre vale mais que um pico isolado.',
          },
        ],
      },
    ],
  },
  {
    chave: 'delivery',
    nome: 'Delivery',
    emoji: '🛵',
    cor: 'text-[#C1441E]',
    aulas: [
      {
        slug: 'area-de-entrega',
        titulo: 'Como configurar sua área de entrega',
        descricao: 'Área grande demais gera pedido que chega frio e entregador irritado. Pequena demais deixa dinheiro na mesa.',
        acao: { label: 'Ajustar minha área', path: '/configuracoes' },
        topicos: [
          {
            titulo: 'O limite é o tempo, não a distância',
            texto: 'Cinco quilômetros em avenida livre são mais rápidos que dois no centro às 18h. Pense em quantos minutos o pedido aguenta antes de estragar a experiência.',
          },
          {
            titulo: 'A taxa cresce com a distância',
            texto: 'Na Commerly a taxa é calculada por quilômetro, com mínimo e máximo. O cliente distante paga mais, o que mantém a entrega longa viável em vez de deficitária.',
          },
          {
            titulo: 'Cadastre o endereço da loja com precisão',
            texto: 'A distância é medida a partir das coordenadas da sua loja. Endereço impreciso gera taxa errada — quase sempre a menor, e o prejuízo é seu.',
          },
          {
            titulo: 'Comece pequeno e amplie',
            texto: 'É mais fácil aumentar o raio depois de dar conta do movimento atual do que recuar de uma área que você já prometeu atender.',
          },
        ],
      },
      {
        slug: 'tempo-de-preparo',
        titulo: 'Como definir tempo de preparo ideal',
        descricao: 'O tempo que você promete é o tempo pelo qual você será julgado. Prometer menos do que consegue cumprir é o caminho mais rápido para a nota baixa.',
        acao: { label: 'Ajustar tempo de preparo', path: '/configuracoes' },
        topicos: [
          {
            titulo: 'Meça no pior dia, não no melhor',
            texto: 'Cronometre o preparo no sábado à noite, não na terça de manhã. O cliente que pede no pico é o que mais reclama do atraso.',
          },
          {
            titulo: 'Preparo não é entrega',
            texto: 'O cliente vê preparo + deslocamento. Um preparo de 20 minutos com 15 de trajeto é uma promessa de 35, e é essa que ele vai cobrar.',
          },
          {
            titulo: 'Prometa um pouco a mais',
            texto: 'Entregar antes do prometido gera avaliação boa. Entregar depois gera avaliação ruim, mesmo que o tempo absoluto seja o mesmo.',
          },
          {
            titulo: 'Ajuste por pedido quando precisar',
            texto: 'Um pedido grande demora mais. A Commerly deixa você ajustar o tempo daquele pedido específico em vez de atrasar calado.',
          },
        ],
      },
      {
        slug: 'cancelamentos',
        titulo: 'Como lidar com cancelamentos',
        descricao: 'Cancelamento vai acontecer. O que separa a loja boa da ruim é o que ela faz nos cinco minutos seguintes.',
        acao: { label: 'Ver meus pedidos', path: '/pedidos' },
        topicos: [
          {
            titulo: 'Cancele cedo ou não cancele',
            texto: 'Se faltou insumo, avise antes de começar o preparo. Cancelar com o entregador a caminho custa a corrida, a comida e o cliente.',
          },
          {
            titulo: 'Ofereça a alternativa junto com a má notícia',
            texto: '"Acabou o X, mas tenho o Y pelo mesmo preço" salva boa parte dos pedidos. "Acabou o X" sozinho perde todos.',
          },
          {
            titulo: 'Cliente que cancela muito não é cliente ruim por definição',
            texto: 'Às vezes é o cardápio desatualizado, o tempo irreal ou a área grande demais. Antes de culpar o cliente, olhe o padrão dos cancelamentos.',
          },
          {
            titulo: 'Registre o motivo',
            texto: 'Sem o motivo, o cancelamento é só um número. Com ele, vira o item que você conserta na próxima semana.',
          },
        ],
      },
    ],
  },
]

/** Todas as aulas, achatadas — a ordem é a de exibição. */
export const AULAS: Aula[] = CATEGORIAS.flatMap(c => c.aulas)

export const TOTAL_AULAS = AULAS.length

/** Slugs válidos. Serve para ignorar progresso de aulas que não existem mais. */
const SLUGS = new Set(AULAS.map(a => a.slug))

export function aulaValida(slug: string): boolean {
  return SLUGS.has(slug)
}

/** Quantas aulas de uma categoria já foram concluídas. */
export function concluidasNaCategoria(categoria: Categoria, concluidas: Set<string>): number {
  return categoria.aulas.filter(a => concluidas.has(a.slug)).length
}

/** Percentual 0-100 de conclusão geral. */
export function progressoPct(concluidas: Set<string>): number {
  const validas = [...concluidas].filter(aulaValida).length
  return TOTAL_AULAS === 0 ? 0 : Math.round((validas / TOTAL_AULAS) * 100)
}
