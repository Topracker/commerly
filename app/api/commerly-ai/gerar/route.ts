import { NextRequest, NextResponse } from 'next/server'
import { supabaseDaRota, usuarioDaRota, lojaDoUsuario } from '../../../lib/rotaSupabase'
import { rateLimit } from '../../../lib/rate-limit'
import { chamarGemini, textoDaResposta } from '../../../lib/gemini'

export const runtime = 'nodejs'

type Tipo = 'post_instagram' | 'post_whatsapp' | 'relatorio'
const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export async function POST(request: NextRequest) {
  const supabase = await supabaseDaRota()
  const user = await usuarioDaRota(supabase)
  if (!user) return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 })
  if (!rateLimit(`commerly-ai:${user.id}`, 15, 60 * 60_000)) {
    return NextResponse.json({ erro: 'Limite atingido. Tente de novo em uma hora.' }, { status: 429 })
  }

  const body = await request.json().catch(() => ({}))
  const tipo: Tipo = body?.tipo
  if (!['post_instagram', 'post_whatsapp', 'relatorio'].includes(tipo)) {
    return NextResponse.json({ erro: 'Tipo inválido' }, { status: 400 })
  }

  const loja = await lojaDoUsuario(supabase, user.id)
  if (!loja) return NextResponse.json({ erro: 'Loja não encontrada' }, { status: 404 })

  // Dados reais dos últimos 30 dias.
  const desde = new Date(Date.now() - 30 * 86400000).toISOString()
  const [{ data: vendas }, { data: pedidos }, { data: produtos }] = await Promise.all([
    supabase.from('vendas').select('valor_total, quantidade, produtos(nome)').eq('loja_id', loja.id).gte('created_at', desde).limit(500),
    supabase.from('pedidos_clientes').select('total').eq('loja_id', loja.id).neq('status', 'cancelado').gte('created_at', desde),
    supabase.from('produtos').select('nome, preco_venda').eq('loja_id', loja.id).order('created_at', { ascending: false }).limit(20),
  ])

  const faturamento =
    (vendas || []).reduce((s: number, v: any) => s + (Number(v.valor_total) || 0), 0) +
    (pedidos || []).reduce((s: number, p: any) => s + (Number(p.total) || 0), 0)
  const qtdPedidos = (pedidos || []).length + (vendas || []).length

  const porProduto = new Map<string, number>()
  for (const v of vendas || []) {
    const nome = (v as any).produtos?.nome
    if (nome) porProduto.set(nome, (porProduto.get(nome) || 0) + (Number(v.quantidade) || 1))
  }
  let topProdutos = [...porProduto.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n]) => n)
  if (topProdutos.length === 0) topProdutos = (produtos || []).slice(0, 3).map((p: any) => p.nome)

  const contexto = {
    nome: loja.nome, nicho: loja.tipo, cidade: loja.localizacao || '',
    faturamento: brl(faturamento), pedidos: qtdPedidos, topProdutos,
  }

  const prompts: Record<Tipo, string> = {
    post_instagram: `Você é social media de um pequeno comércio no Brasil. Escreva uma legenda de Instagram curta, calorosa e vendedora para "${contexto.nome}" (${contexto.nicho}${contexto.cidade ? `, ${contexto.cidade}` : ''}). Destaque ${topProdutos.length ? `os produtos: ${topProdutos.join(', ')}` : 'os produtos da loja'}. Use emojis com moderação, 2-3 frases, uma chamada para ação e finalize com "📲 Peça pela Commerly". Inclua 5 a 8 hashtags relevantes ao nicho e à cidade no final. Não invente preços.`,
    post_whatsapp: `Escreva uma mensagem curta de divulgação para lista de transmissão de WhatsApp da loja "${contexto.nome}" (${contexto.nicho}). Tom próximo e direto, 2 frases, 1 emoji, destacando ${topProdutos[0] || 'as novidades'} e convidando a pedir pela Commerly. Sem hashtags.`,
    relatorio: `Você é consultor de pequenos negócios. Com base nos números dos últimos 30 dias da loja "${contexto.nome}" (${contexto.nicho}) — faturamento ${contexto.faturamento}, ${contexto.pedidos} pedidos/vendas, produtos que mais saem: ${topProdutos.join(', ') || 'n/d'} — escreva um relatório inteligente e motivador em português com: 1 parágrafo de leitura dos números e 3 sugestões práticas e específicas para vender mais na próxima semana. Seja concreto e evite generalidades. Máx 180 palavras.`,
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
    return `Nos últimos 30 dias a ${loja.nome} movimentou ${contexto.faturamento} em ${contexto.pedidos} pedidos/vendas. ${topProdutos.length ? `Seus destaques foram ${topProdutos.join(', ')}. ` : ''}\n\nSugestões para a próxima semana:\n1. Crie um combo com seus produtos mais vendidos e destaque-o na Commerly.\n2. Poste nas redes 3x na semana com foto real — consistência traz pedido.\n3. Ative uma promoção relâmpago no horário de pico para acelerar o giro.`
  }

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return NextResponse.json({ texto: fallback(), fonte: 'template' })

  const r = await chamarGemini(apiKey, {
    contents: [{ parts: [{ text: prompts[tipo] }] }],
    generationConfig: { temperature: 0.9, maxOutputTokens: 400 },
  })
  const texto = r.ok ? textoDaResposta(r.data).trim() : ''
  if (!texto) return NextResponse.json({ texto: fallback(), fonte: 'template' })
  return NextResponse.json({ texto, fonte: 'gemini' })
}
