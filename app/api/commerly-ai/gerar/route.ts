import { NextRequest, NextResponse } from 'next/server'
import { supabaseDaRota, usuarioDaRota, lojaDoUsuario } from '../../../lib/rotaSupabase'
import { rateLimit } from '../../../lib/rate-limit'
import { chamarGemini, textoDaResposta } from '../../../lib/gemini'

export const runtime = 'nodejs'

type Tipo = 'post_instagram' | 'post_whatsapp' | 'relatorio' | 'sugestao_estoque' | 'analise_vendas'
const TIPOS: Tipo[] = ['post_instagram', 'post_whatsapp', 'relatorio', 'sugestao_estoque', 'analise_vendas']
const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

export async function POST(request: NextRequest) {
  const supabase = await supabaseDaRota()
  const user = await usuarioDaRota(supabase)
  if (!user) return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 })
  if (!rateLimit(`commerly-ai:${user.id}`, 15, 60 * 60_000)) {
    return NextResponse.json({ erro: 'Limite atingido. Tente de novo em uma hora.' }, { status: 429 })
  }

  const body = await request.json().catch(() => ({}))
  const tipo: Tipo = body?.tipo
  if (!TIPOS.includes(tipo)) {
    return NextResponse.json({ erro: 'Tipo inválido' }, { status: 400 })
  }

  const loja = await lojaDoUsuario(supabase, user.id)
  if (!loja) return NextResponse.json({ erro: 'Loja não encontrada' }, { status: 404 })

  // Dados reais dos últimos 30 dias.
  const desde = new Date(Date.now() - 30 * 86400000).toISOString()
  const [{ data: vendas }, { data: pedidos }, { data: produtos }] = await Promise.all([
    supabase.from('vendas').select('valor_total, quantidade, created_at, produtos(nome)').eq('loja_id', loja.id).gte('created_at', desde).limit(2000),
    supabase.from('pedidos_clientes').select('total, created_at').eq('loja_id', loja.id).neq('status', 'cancelado').gte('created_at', desde).limit(2000),
    supabase.from('produtos').select('nome, preco_venda, quantidade').eq('loja_id', loja.id).order('created_at', { ascending: false }).limit(200),
  ])

  const faturamento =
    (vendas || []).reduce((s: number, v: any) => s + (Number(v.valor_total) || 0), 0) +
    (pedidos || []).reduce((s: number, p: any) => s + (Number(p.total) || 0), 0)
  const qtdPedidos = (pedidos || []).length + (vendas || []).length

  // Giro por produto (quantidade vendida em 30 dias).
  const giro = new Map<string, number>()
  for (const v of vendas || []) {
    const nome = (v as any).produtos?.nome
    if (nome) giro.set(nome, (giro.get(nome) || 0) + (Number(v.quantidade) || 1))
  }
  let topProdutos = [...giro.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n]) => n)
  if (topProdutos.length === 0) topProdutos = (produtos || []).slice(0, 3).map((p: any) => p.nome)

  const contexto = {
    nome: loja.nome, nicho: loja.tipo, cidade: loja.localizacao || '',
    faturamento: brl(faturamento), pedidos: qtdPedidos, topProdutos,
  }

  // --- Sugestão de estoque: cruza giro (30d) com o estoque atual ---
  type Repor = { nome: string; estoque: number; giroSemana: number; sugerido: number }
  const calcularReposicao = (): Repor[] => {
    const itens: Repor[] = []
    for (const p of (produtos || []) as any[]) {
      if (p.quantidade == null) continue // produto sem controle de estoque
      const vendido30 = giro.get(p.nome) || 0
      const giroSemana = Math.round((vendido30 / 4.3) * 10) / 10
      if (giroSemana <= 0) continue // não vende: não sugere repor
      const estoque = Number(p.quantidade) || 0
      // Repor quando o estoque não cobre ~2 semanas de venda.
      if (estoque < giroSemana * 2) {
        const sugerido = Math.max(1, Math.ceil(giroSemana * 3 - estoque))
        itens.push({ nome: p.nome, estoque, giroSemana, sugerido })
      }
    }
    return itens.sort((a, b) => b.giroSemana - a.giroSemana).slice(0, 8)
  }

  // --- Análise de vendas: agrega por semana, dia da semana e hora ---
  const analisarVendas = () => {
    const seteDias = Date.now() - 7 * 86400000
    const quatorzeDias = Date.now() - 14 * 86400000
    let atual = 0, anterior = 0
    const porDia = new Array(7).fill(0)
    const porHora = new Array(24).fill(0)
    const registrar = (valor: number, quando: string) => {
      const t = new Date(quando).getTime()
      if (t >= seteDias) atual += valor
      else if (t >= quatorzeDias) anterior += valor
      const d = new Date(quando)
      porDia[d.getDay()] += valor
      porHora[d.getHours()] += valor
    }
    for (const v of vendas || []) registrar(Number((v as any).valor_total) || 0, (v as any).created_at)
    for (const p of pedidos || []) registrar(Number((p as any).total) || 0, (p as any).created_at)
    const cresc = anterior > 0 ? Math.round(((atual - anterior) / anterior) * 100) : (atual > 0 ? 100 : 0)
    const melhorDia = porDia.some(x => x > 0) ? DIAS[porDia.indexOf(Math.max(...porDia))] : null
    const picoHora = porHora.some(x => x > 0) ? porHora.indexOf(Math.max(...porHora)) : null
    return { atual, anterior, cresc, melhorDia, picoHora }
  }

  const prompts: Record<Tipo, string> = {
    post_instagram: `Você é social media de um pequeno comércio no Brasil. Escreva uma legenda de Instagram curta, calorosa e vendedora para "${contexto.nome}" (${contexto.nicho}${contexto.cidade ? `, ${contexto.cidade}` : ''}). Destaque ${topProdutos.length ? `os produtos: ${topProdutos.join(', ')}` : 'os produtos da loja'}. Use emojis com moderação, 2-3 frases, uma chamada para ação e finalize com "📲 Peça pela Commerly". Inclua 5 a 8 hashtags relevantes ao nicho e à cidade no final. Não invente preços.`,
    post_whatsapp: `Escreva uma mensagem curta de divulgação para lista de transmissão de WhatsApp da loja "${contexto.nome}" (${contexto.nicho}). Tom próximo e direto, 2 frases, 1 emoji, destacando ${topProdutos[0] || 'as novidades'} e convidando a pedir pela Commerly. Sem hashtags.`,
    relatorio: `Você é consultor de pequenos negócios. Com base nos números dos últimos 30 dias da loja "${contexto.nome}" (${contexto.nicho}) — faturamento ${contexto.faturamento}, ${contexto.pedidos} pedidos/vendas, produtos que mais saem: ${topProdutos.join(', ') || 'n/d'} — escreva um relatório inteligente e motivador em português com: 1 parágrafo de leitura dos números e 3 sugestões práticas e específicas para vender mais na próxima semana. Seja concreto e evite generalidades. Máx 180 palavras.`,
    sugestao_estoque: '', // preenchido abaixo (depende do cálculo)
    analise_vendas: '',   // preenchido abaixo (depende do cálculo)
  }

  // Fallback por template (funciona mesmo sem Gemini configurado ou fora do ar).
  const fallback = (): string => {
    if (tipo === 'post_instagram') {
      const hs = ['#comerciolocal', '#comprelocal', `#${(loja.tipo || 'loja').replace(/\s+/g, '')}`, '#commerly']
      return `✨ Novidades na ${loja.nome}! ${topProdutos.length ? `Hoje tem ${topProdutos.slice(0, 2).join(' e ')} fresquinho pra você. ` : ''}Venha conferir e apoie o comércio local. 📲 Peça pela Commerly\n\n${hs.join(' ')}`
    }
    if (tipo === 'post_whatsapp') {
      return `Oi! 👋 Passando pra avisar que a ${loja.nome} está com ${topProdutos[0] || 'novidades'} pra você. Faça seu pedido pela Commerly, é rapidinho!`
    }
    if (tipo === 'sugestao_estoque') {
      const rep = calcularReposicao()
      if (rep.length === 0) {
        return `Seu estoque está saudável na ${loja.nome}. ✅ Nenhum produto com giro nos últimos 30 dias está perto de acabar. Continue registrando as vendas para eu afinar as sugestões de reposição.`
      }
      const linhas = rep.map(r => `• ${r.nome}: ${r.estoque} em estoque · vende ~${r.giroSemana}/semana → repor ~${r.sugerido}`)
      return `📦 Reposição sugerida para a ${loja.nome} (baseada no giro de 30 dias):\n\n${linhas.join('\n')}\n\nDica: priorize os de cima — são os que mais saem e estão mais perto de faltar.`
    }
    if (tipo === 'analise_vendas') {
      const a = analisarVendas()
      const tend = a.cresc > 0 ? `📈 crescimento de ${a.cresc}% vs. a semana anterior` : a.cresc < 0 ? `📉 queda de ${Math.abs(a.cresc)}% vs. a semana anterior` : 'estável em relação à semana anterior'
      const extra: string[] = []
      if (a.melhorDia) extra.push(`Seu dia mais forte é ${a.melhorDia}.`)
      if (a.picoHora != null) extra.push(`O pico de vendas costuma ser por volta das ${a.picoHora}h.`)
      if (topProdutos.length) extra.push(`Destaques: ${topProdutos.join(', ')}.`)
      return `📊 Análise da semana — ${loja.nome}\n\nVocê fez ${brl(a.atual)} nos últimos 7 dias (${tend}). ${extra.join(' ')}\n\nSugestões:\n1. Reforce o estoque e a equipe no seu dia/horário de pico.\n2. Crie uma promoção relâmpago nos dias mais fracos para equilibrar o giro.\n3. Poste seus destaques nas redes 3x na semana com foto real.`
    }
    return `Nos últimos 30 dias a ${loja.nome} movimentou ${contexto.faturamento} em ${contexto.pedidos} pedidos/vendas. ${topProdutos.length ? `Seus destaques foram ${topProdutos.join(', ')}. ` : ''}\n\nSugestões para a próxima semana:\n1. Crie um combo com seus produtos mais vendidos e destaque-o na Commerly.\n2. Poste nas redes 3x na semana com foto real — consistência traz pedido.\n3. Ative uma promoção relâmpago no horário de pico para acelerar o giro.`
  }

  // Prompts que dependem dos cálculos (usados só quando o Gemini está ativo).
  if (tipo === 'sugestao_estoque') {
    const rep = calcularReposicao()
    const linhas = rep.map(r => `${r.nome}: estoque ${r.estoque}, vende ~${r.giroSemana}/semana`).join('; ') || 'sem produtos com giro registrado'
    prompts.sugestao_estoque = `Você é gestor de estoque de um pequeno comércio ("${contexto.nome}", ${contexto.nicho}). Com base nestes produtos e seu giro dos últimos 30 dias — ${linhas} — escreva uma recomendação de reposição prática em português: liste em tópicos o que repor primeiro e uma quantidade aproximada para cobrir ~3 semanas, começando pelos de maior giro/risco de ruptura. Se não houver o que repor, parabenize e explique. Máx 160 palavras. Não invente produtos além dos listados.`
  }
  if (tipo === 'analise_vendas') {
    const a = analisarVendas()
    prompts.analise_vendas = `Você é analista de vendas de um pequeno comércio ("${contexto.nome}", ${contexto.nicho}). Dados desta semana: faturamento 7 dias ${brl(a.atual)}, semana anterior ${brl(a.anterior)} (variação ${a.cresc}%), dia mais forte ${a.melhorDia || 'n/d'}, horário de pico ${a.picoHora != null ? a.picoHora + 'h' : 'n/d'}, produtos que mais saem ${topProdutos.join(', ') || 'n/d'}. Escreva uma análise semanal em português: 1 parágrafo interpretando os números (tendência, pico, destaques) e 3 ações concretas para a próxima semana. Seja específico e motivador. Máx 180 palavras.`
  }

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return NextResponse.json({ texto: fallback(), fonte: 'template' })

  const r = await chamarGemini(apiKey, {
    contents: [{ parts: [{ text: prompts[tipo] }] }],
    generationConfig: { temperature: tipo === 'sugestao_estoque' || tipo === 'analise_vendas' ? 0.7 : 0.9, maxOutputTokens: 500 },
  })
  const texto = r.ok ? textoDaResposta(r.data).trim() : ''
  if (!texto) return NextResponse.json({ texto: fallback(), fonte: 'template' })
  return NextResponse.json({ texto, fonte: 'gemini' })
}
