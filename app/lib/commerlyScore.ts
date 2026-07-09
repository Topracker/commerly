// Commerly Score — nota 0-100 da saude do negocio, em 4 pilares de 25 pts:
//   Financeiro · Clientes · Operacao · Crescimento
// Calculado 100% a partir de dados que a loja ja tem (vendas, pedidos, produtos,
// gastos, avaliacoes). Funcoes puras — os dados entram prontos pelo dashboard.

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v))

export type ScoreInput = {
  // Financeiro
  faturamentoMes: number
  metaMensal: number
  resultadoLiquido: number
  // Clientes
  totalClientes: number       // clientes distintos que compraram
  clientesRecorrentes: number // com 2+ compras
  notaMedia: number | null    // media das avaliacoes (1-5)
  totalAvaliacoes: number
  // Operacao
  produtosBaixo: number
  produtosTotal: number
  pedidosEntregues: number
  pedidosCancelados: number
  // Crescimento
  fatUltimos7: number
  fatAnteriores7: number       // os 7 dias antes desses
  clientesNovos30: number      // 1a compra nos ultimos 30 dias
}

export type ChavePilar = 'financeiro' | 'clientes' | 'operacao' | 'crescimento'

export type Pilar = {
  chave: ChavePilar
  nome: string
  emoji: string
  pontos: number   // 0-25
  resumo: string
}

export type CommerlyScore = {
  total: number       // 0-100
  nivel: string       // rotulo do score
  cor: string         // classe tailwind da cor
  pilares: Pilar[]
  insight: string     // "insight do dia"
  acao: string        // acao recomendada (pilar mais fraco)
  pilarMaisFraco: ChavePilar
}

const reais = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`

function nivelDoScore(total: number): { nivel: string; cor: string } {
  if (total >= 80) return { nivel: 'Excelente', cor: 'text-green-400' }
  if (total >= 60) return { nivel: 'Saudável', cor: 'text-[#6FD98F]' }
  if (total >= 40) return { nivel: 'Atenção', cor: 'text-amber-300' }
  return { nivel: 'Crítico', cor: 'text-red-400' }
}

export function calcularCommerlyScore(input: ScoreInput): CommerlyScore {
  // ---- Financeiro (25) ----
  const metaPct = input.metaMensal > 0 ? clamp(input.faturamentoMes / input.metaMensal, 0, 1) : 0
  const financeiro = clamp(
    15 * metaPct + (input.resultadoLiquido > 0 ? 10 : input.resultadoLiquido === 0 ? 5 : 0),
    0, 25,
  )

  // ---- Clientes (25) ----
  const volume = clamp(input.totalClientes / 20, 0, 1) * 10
  const recorrencia = input.totalClientes > 0 ? (input.clientesRecorrentes / input.totalClientes) * 8 : 0
  const satisfacao = input.totalAvaliacoes > 0 ? (clamp((input.notaMedia ?? 0) / 5, 0, 1)) * 7 : 3.5
  const clientes = clamp(volume + recorrencia + satisfacao, 0, 25)

  // ---- Operacao (25) ----
  const estoqueOk = input.produtosTotal > 0 ? (1 - input.produtosBaixo / input.produtosTotal) * 12 : 12
  const totalFinalizados = input.pedidosEntregues + input.pedidosCancelados
  const entregaOk = totalFinalizados > 0 ? (input.pedidosEntregues / totalFinalizados) * 13 : 8
  const operacao = clamp(estoqueOk + entregaOk, 0, 25)

  // ---- Crescimento (25) ----
  let tendencia: number
  if (input.fatAnteriores7 <= 0) tendencia = input.fatUltimos7 > 0 ? 15 : 5
  else {
    const cresc = (input.fatUltimos7 - input.fatAnteriores7) / input.fatAnteriores7
    tendencia = clamp(0.5 + cresc, 0, 1) * 15 // flat=7.5, +50%=15, -50%=0
  }
  const novos = clamp(input.clientesNovos30 / 10, 0, 1) * 10
  const crescimento = clamp(tendencia + novos, 0, 25)

  const pilares: Pilar[] = [
    { chave: 'financeiro', nome: 'Financeiro', emoji: '💰', pontos: Math.round(financeiro),
      resumo: input.resultadoLiquido >= 0 ? `Resultado no azul (${reais(input.resultadoLiquido)})` : `Resultado negativo (${reais(input.resultadoLiquido)})` },
    { chave: 'clientes', nome: 'Clientes', emoji: '🧑‍🤝‍🧑', pontos: Math.round(clientes),
      resumo: `${input.totalClientes} clientes · ${input.clientesRecorrentes} recorrentes` },
    { chave: 'operacao', nome: 'Operação', emoji: '⚙️', pontos: Math.round(operacao),
      resumo: input.produtosBaixo > 0 ? `${input.produtosBaixo} item(ns) com estoque baixo` : 'Estoque em dia' },
    { chave: 'crescimento', nome: 'Crescimento', emoji: '📈', pontos: Math.round(crescimento),
      resumo: crescimentoResumo(input) },
  ]

  const total = clamp(pilares.reduce((s, p) => s + p.pontos, 0), 0, 100)
  const maisFraco = [...pilares].sort((a, b) => a.pontos - b.pontos)[0]
  const { nivel, cor } = nivelDoScore(total)

  return {
    total,
    nivel,
    cor,
    pilares,
    insight: insightDoDia(input, pilares),
    acao: acaoRecomendada(maisFraco.chave, input),
    pilarMaisFraco: maisFraco.chave,
  }
}

function crescimentoResumo(input: ScoreInput): string {
  if (input.fatAnteriores7 <= 0) return input.fatUltimos7 > 0 ? 'Primeiras vendas da semana' : 'Sem vendas na semana'
  const pct = Math.round(((input.fatUltimos7 - input.fatAnteriores7) / input.fatAnteriores7) * 100)
  if (pct > 0) return `Vendas +${pct}% vs. semana anterior`
  if (pct < 0) return `Vendas ${pct}% vs. semana anterior`
  return 'Vendas estáveis na semana'
}

function insightDoDia(input: ScoreInput, pilares: Pilar[]): string {
  const cresc = input.fatAnteriores7 > 0 ? (input.fatUltimos7 - input.fatAnteriores7) / input.fatAnteriores7 : null
  if (cresc != null && cresc >= 0.1) return `📈 Suas vendas cresceram ${Math.round(cresc * 100)}% na última semana. Aproveite o embalo!`
  if (input.metaMensal > 0 && input.faturamentoMes >= input.metaMensal) return '🎯 Você bateu a meta do mês! Que tal já mirar mais alto?'
  if (input.totalAvaliacoes >= 3 && (input.notaMedia ?? 0) >= 4.5) return `⭐ Seus clientes te amam: nota média ${(input.notaMedia ?? 0).toFixed(1)}. Use isso na divulgação.`
  if (cresc != null && cresc <= -0.15) return `📉 As vendas caíram ${Math.abs(Math.round(cresc * 100))}% na semana. Uma promoção pode reaquecer.`
  if (input.resultadoLiquido > 0) return `💰 Seu mês está no azul: ${reais(input.resultadoLiquido)} de resultado líquido.`
  const forte = [...pilares].sort((a, b) => b.pontos - a.pontos)[0]
  return `${forte.emoji} Seu ponto forte é ${forte.nome}. Continue registrando vendas e gastos para o Score refletir seu negócio.`
}

function acaoRecomendada(chave: ChavePilar, input: ScoreInput): string {
  switch (chave) {
    case 'financeiro':
      return input.metaMensal > 0 && input.faturamentoMes < input.metaMensal
        ? `Você está a ${reais(input.metaMensal - input.faturamentoMes)} da meta. Foque nos produtos de maior margem e registre todos os gastos.`
        : 'Reduza custos e priorize os produtos de maior lucro para melhorar o resultado líquido.'
    case 'clientes':
      return 'Ative a Campanha de Retorno e o programa de pontos para trazer clientes de volta e aumentar a recorrência.'
    case 'operacao':
      return input.produtosBaixo > 0
        ? `Reponha os ${input.produtosBaixo} item(ns) com estoque baixo para não perder vendas.`
        : 'Agilize o preparo e a entrega dos pedidos para reduzir cancelamentos.'
    case 'crescimento':
      return 'Crie uma promoção automática ou um combo inteligente para reaquecer as vendas desta semana.'
  }
}
