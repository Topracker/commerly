// Conteúdo do blog (SEO). Artigos reais, escritos para donos de pequenos
// comércios — as buscas-alvo estão em `keywords`.

export type Artigo = {
  slug: string
  titulo: string
  descricao: string
  keywords: string[]
  data: string
  leitura: string
  paragrafos: { h?: string; p: string }[]
}

export const ARTIGOS: Artigo[] = [
  {
    slug: 'aumentar-vendas-hamburgueria-30-dias',
    titulo: 'Como aumentar as vendas da sua hamburgueria em 30 dias',
    descricao: 'Um plano prático de 30 dias para vender mais hambúrguer: combos, delivery próprio, fidelidade e presença digital.',
    keywords: ['sistema para hamburgueria', 'aumentar vendas hamburgueria', 'delivery de hambúrguer'],
    data: '2026-07-11', leitura: '6 min',
    paragrafos: [
      { p: 'Vender mais hambúrguer não é sorte — é método. Em 30 dias, com pequenos ajustes no cardápio, no atendimento e na presença digital, dá para ver o ticket médio e o número de pedidos subirem de forma consistente.' },
      { h: 'Semana 1 — Arrume o cardápio', p: 'Destaque os 3 lanches mais lucrativos, crie 2 combos (lanche + bebida + batata) e revise as fotos. Um combo bem montado aumenta o ticket médio sem esforço de venda.' },
      { h: 'Semana 2 — Ative o delivery próprio', p: 'Marketplaces cobram 20–30% por pedido. Com delivery próprio você fica com a margem, tem o contato do cliente e controla a experiência. Um cardápio digital com QR Code na mesa e no balcão traz o cliente para o seu canal.' },
      { h: 'Semana 3 — Fidelize', p: 'Cashback e um clube de pontos fazem o cliente voltar. Quem já comprou é muito mais barato de reativar do que conquistar um novo. Uma campanha simples de “volte e ganhe” recupera clientes parados.' },
      { h: 'Semana 4 — Apareça', p: 'Poste no feed local, peça avaliações a quem elogiou e mostre os bastidores. Presença digital constante mantém a hamburgueria na cabeça de quem está com fome perto de você.' },
    ],
  },
  {
    slug: 'delivery-proprio-vs-ifood',
    titulo: 'Delivery próprio vs iFood: o que vale mais a pena?',
    descricao: 'Comparamos custo, margem, dados do cliente e experiência entre ter delivery próprio e depender de marketplaces.',
    keywords: ['app delivery próprio', 'delivery próprio vs ifood', 'sistema de delivery'],
    data: '2026-07-11', leitura: '5 min',
    paragrafos: [
      { p: 'A pergunta não é “um ou outro”, e sim quanto da sua operação deve depender de um marketplace. Entender os trade-offs evita que a comissão coma o seu lucro.' },
      { h: 'Custo e margem', p: 'Marketplaces cobram comissão por pedido — geralmente 20% a 30%. No delivery próprio, você paga uma mensalidade fixa e fica com a margem de cada venda. Quanto mais você vende, mais o próprio pesa a seu favor.' },
      { h: 'Dono do cliente', p: 'No marketplace, o cliente é do marketplace. No delivery próprio, o contato, o histórico e a fidelização são seus — e isso vale ouro para reativar e vender de novo.' },
      { h: 'A conta que faz sentido', p: 'Use o marketplace como vitrine para descobrir clientes novos, e o delivery próprio como canal principal de recompra. Assim você paga comissão só onde ela traz clientes de verdade.' },
    ],
  },
  {
    slug: 'organizar-financeiro-comercio-do-zero',
    titulo: 'Como organizar o financeiro do seu comércio do zero',
    descricao: 'Fluxo de caixa, separação de contas, precificação e o DAS do MEI — um passo a passo para não se perder nas contas.',
    keywords: ['financeiro para comércio', 'fluxo de caixa pequeno negócio', 'controle financeiro MEI'],
    data: '2026-07-11', leitura: '7 min',
    paragrafos: [
      { p: 'A maioria dos pequenos comércios quebra não por falta de venda, mas por falta de controle. Organizar o financeiro do zero é mais simples do que parece — e muda o jogo.' },
      { h: '1. Separe as contas', p: 'Conta da pessoa física e conta do negócio nunca se misturam. Sem isso, você nunca sabe o lucro real. Defina um pró-labore (o seu salário) e pague-se todo mês.' },
      { h: '2. Registre tudo', p: 'Toda entrada e toda saída. Um fluxo de caixa diário mostra para onde o dinheiro vai. O que não é medido não é gerenciado.' },
      { h: '3. Precifique com margem', p: 'Preço não é custo + “um tanto”. Some custo do produto, custos fixos rateados e a margem desejada. Vender muito no prejuízo só acelera o problema.' },
      { h: '4. Guarde o imposto', p: 'Se você é MEI, separe o valor do DAS todo mês. Deixar para depois é a dívida mais comum do pequeno negócio.' },
    ],
  },
  {
    slug: '10-erros-donos-pequenos-comercios',
    titulo: 'Os 10 erros mais comuns de donos de pequenos comércios',
    descricao: 'Do preço no chute à falta de recompra: os erros que travam o crescimento e como corrigir cada um.',
    keywords: ['erros pequeno comércio', 'gestão de comércio', 'como administrar loja'],
    data: '2026-07-11', leitura: '6 min',
    paragrafos: [
      { p: 'Alguns erros aparecem em quase todo comércio que está começando. A boa notícia: todos têm conserto.' },
      { h: 'Os erros', p: '1) Misturar dinheiro pessoal e do negócio. 2) Precificar no chute. 3) Não saber o produto mais lucrativo. 4) Ignorar quem já comprou. 5) Depender de um único canal de venda. 6) Não pedir avaliação. 7) Estoque sem controle. 8) Não ter presença digital. 9) Não separar imposto. 10) Não olhar os números toda semana.' },
      { h: 'Como corrigir', p: 'Comece por um: separe as contas esta semana. Depois ligue o controle de estoque e um relatório semanal simples. Cada correção destrava a próxima — e em um mês o negócio já respira melhor.' },
    ],
  },
  {
    slug: 'fidelizar-clientes-comercio-local',
    titulo: 'Como fidelizar clientes no comércio local',
    descricao: 'Programas de pontos, cashback, atendimento e recompra: como fazer o cliente do bairro voltar sempre.',
    keywords: ['fidelizar clientes', 'programa de fidelidade comércio', 'cashback loja'],
    data: '2026-07-11', leitura: '5 min',
    paragrafos: [
      { p: 'Conquistar um cliente novo custa caro. Fazer o cliente atual voltar é o crescimento mais barato que existe — e o comércio local tem uma vantagem enorme aqui: a proximidade.' },
      { h: 'Dê um motivo para voltar', p: 'Pontos, cashback ou um clube com benefícios crescentes criam um hábito. O cliente pensa “já tenho pontos aqui” antes de escolher o concorrente.' },
      { h: 'Trate bem e lembre', p: 'Nome na conversa, um agradecimento, um cupom de “sentimos sua falta” para quem sumiu. Pequenos gestos, feitos de forma consistente, constroem relação.' },
      { h: 'Peça e mostre avaliações', p: 'Prova social atrai novos e reforça a confiança dos atuais. Sempre que alguém elogiar, peça para registrar — e mostre com orgulho.' },
    ],
  },
]

export const artigoPorSlug = (slug: string) => ARTIGOS.find(a => a.slug === slug)
