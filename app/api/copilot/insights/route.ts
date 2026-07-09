import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { rateLimit } from '../../../lib/rate-limit'
import { chamarGemini } from '../../../lib/gemini'
import { segundaDaSemana } from '../../../lib/semana'

export type Insight = {
  titulo: string
  texto: string
  acao: string
  rota: string
}

// Rotas que o Copilot pode sugerir. Qualquer outra coisa que o modelo invente é
// descartada — nunca mandamos o comerciante para uma tela que não existe.
const ROTAS_VALIDAS = new Set([
  '/produtos', '/vendas', '/gastos', '/fiado', '/clientes', '/promocoes',
  '/financeiro', '/pedidos', '/historico', '/fornecedores', '/dashboard',
])

const reais = (v: number) => `R$ ${v.toFixed(2)}`

/** Extrai o array de insights da resposta do Gemini, tolerando cercas ```json. */
function parseInsights(texto: string): Insight[] | null {
  const limpo = texto.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  let bruto: unknown
  try { bruto = JSON.parse(limpo) } catch { return null }

  const arr = Array.isArray(bruto)
    ? bruto
    : Array.isArray((bruto as { insights?: unknown[] })?.insights)
      ? (bruto as { insights: unknown[] }).insights
      : null
  if (!arr) return null

  const limpos: Insight[] = []
  for (const item of arr) {
    const i = item as Record<string, unknown>
    const titulo = typeof i.titulo === 'string' ? i.titulo.trim() : ''
    const texto = typeof i.texto === 'string' ? i.texto.trim() : ''
    const acao = typeof i.acao === 'string' ? i.acao.trim() : ''
    const rota = typeof i.rota === 'string' ? i.rota.trim() : ''
    if (!titulo || !texto) continue
    limpos.push({
      titulo: titulo.slice(0, 80),
      texto: texto.slice(0, 300),
      acao: acao.slice(0, 60),
      rota: ROTAS_VALIDAS.has(rota) ? rota : '/dashboard',
    })
  }
  return limpos.length ? limpos.slice(0, 3) : null
}

export async function GET() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } },
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 })

  const { data: loja } = await supabase
    .from('lojas').select('id, nome, tipo, meta_mensal').eq('user_id', user.id).single()
  if (!loja) return NextResponse.json({ erro: 'Loja não encontrada' }, { status: 404 })

  const semana = segundaDaSemana(new Date())

  // Cache: um conjunto de insights por loja por semana.
  const { data: cache } = await supabase
    .from('insights_semanais')
    .select('insights')
    .eq('loja_id', loja.id)
    .eq('semana', semana)
    .maybeSingle()
  if (cache?.insights) {
    return NextResponse.json({ semana, insights: cache.insights, cache: true })
  }

  // Geração custa cota do Gemini: limita tentativas mesmo com o cache furando.
  if (!rateLimit(`copilot:${user.id}`, 5, 60 * 60_000)) {
    return NextResponse.json({ erro: 'Muitas gerações. Tente daqui a pouco.' }, { status: 429 })
  }

  const geminiApiKey = process.env.GEMINI_API_KEY
  if (!geminiApiKey) {
    return NextResponse.json({ erro: 'Copilot não configurado (GEMINI_API_KEY ausente)' }, { status: 500 })
  }

  const trinta = new Date(); trinta.setDate(trinta.getDate() - 30)
  const sessenta = new Date(); sessenta.setDate(sessenta.getDate() - 60)

  const [vendasRes, gastosRes, produtosRes, pedidosRes] = await Promise.all([
    supabase.from('vendas').select('valor_total, lucro, quantidade, created_at, produtos(nome)')
      .eq('loja_id', loja.id).gte('created_at', sessenta.toISOString()),
    supabase.from('gastos').select('descricao, valor, created_at')
      .eq('loja_id', loja.id).gte('created_at', trinta.toISOString()),
    supabase.from('produtos').select('nome, quantidade, quantidade_minima, custo, preco_venda')
      .eq('loja_id', loja.id),
    supabase.from('pedidos_clientes').select('total, status, cliente_id, created_at')
      .eq('loja_id', loja.id).gte('created_at', sessenta.toISOString()),
  ])

  const vendas = vendasRes.data || []
  const gastos = gastosRes.data || []
  const produtos = produtosRes.data || []
  const pedidos = pedidosRes.data || []

  const noPeriodo = <T extends { created_at: string }>(rows: T[], desde: Date) =>
    rows.filter(r => new Date(r.created_at) >= desde)

  const vendas30 = noPeriodo(vendas, trinta)
  const vendasAnt30 = vendas.filter(v => {
    const t = new Date(v.created_at); return t >= sessenta && t < trinta
  })
  const pedidos30 = noPeriodo(pedidos, trinta).filter(p => p.status !== 'cancelado')

  const soma = (rows: { valor_total?: number; total?: number }[], campo: 'valor_total' | 'total') =>
    rows.reduce((a, r) => a + Number(r[campo] || 0), 0)

  const fat30 = soma(vendas30, 'valor_total') + soma(pedidos30, 'total')
  const fatAnt30 = soma(vendasAnt30, 'valor_total')
  const lucro30 = vendas30.reduce((a, v) => a + Number(v.lucro || 0), 0)
  const gastos30 = gastos.reduce((a, g) => a + Number(g.valor || 0), 0)

  // Produtos parados: têm estoque e não venderam nos últimos 30 dias.
  const vendidos = new Set(
    vendas30.map(v => (v.produtos as { nome?: string } | null)?.nome).filter(Boolean) as string[],
  )
  const parados = produtos.filter(p => (p.quantidade ?? 0) > 0 && !vendidos.has(p.nome))
  const estoqueBaixo = produtos.filter(p => p.quantidade <= (p.quantidade_minima || 0))

  // Margem por produto (preço - custo), pra IA falar de precificação.
  const margens = produtos
    .filter(p => Number(p.preco_venda) > 0 && Number(p.custo) > 0)
    .map(p => ({ nome: p.nome, margem: ((Number(p.preco_venda) - Number(p.custo)) / Number(p.preco_venda)) * 100 }))
    .sort((a, b) => a.margem - b.margem)
    .slice(0, 5)

  const clientesDistintos = new Set(pedidos30.map(p => p.cliente_id).filter(Boolean)).size

  const variacao = fatAnt30 > 0 ? Math.round(((fat30 - fatAnt30) / fatAnt30) * 100) : null

  const prompt = `Você é o Copilot da Commerly, consultor de negócios da loja "${loja.nome}" (segmento: ${loja.tipo}).
Gere EXATAMENTE 3 insights acionáveis para esta semana, baseados SOMENTE nos dados abaixo.
Fale em português brasileiro, direto, sem enrolação, como quem conversa com um pequeno comerciante.
Cada insight deve apontar algo concreto dos dados (cite números) e dizer o que fazer.

DADOS (últimos 30 dias):
- Faturamento: ${reais(fat30)}${variacao !== null ? ` (${variacao >= 0 ? '+' : ''}${variacao}% vs. os 30 dias anteriores)` : ''}
- Lucro bruto: ${reais(lucro30)} | Gastos: ${reais(gastos30)} | Resultado: ${reais(lucro30 - gastos30)}
- Meta mensal: ${reais(Number(loja.meta_mensal) || 0)}
- Pedidos online: ${pedidos30.length} de ${clientesDistintos} clientes distintos
- Produtos cadastrados: ${produtos.length}

PRODUTOS PARADOS (com estoque, sem vender há 30 dias) — ${parados.length}:
${parados.slice(0, 10).map(p => `- ${p.nome} (${p.quantidade} un.)`).join('\n') || 'nenhum'}

ESTOQUE BAIXO — ${estoqueBaixo.length}:
${estoqueBaixo.slice(0, 10).map(p => `- ${p.nome}: ${p.quantidade} un.`).join('\n') || 'nenhum'}

MENORES MARGENS:
${margens.map(m => `- ${m.nome}: ${m.margem.toFixed(0)}% de margem`).join('\n') || 'sem custo cadastrado'}

Responda APENAS com um array JSON de 3 objetos, sem texto fora do JSON:
[{"titulo":"...","texto":"...","acao":"...","rota":"..."}]
- "titulo": até 6 palavras.
- "texto": 1 a 2 frases citando números reais dos dados.
- "acao": o botão, até 4 palavras (ex: "Criar promoção").
- "rota": uma destas exatamente: ${[...ROTAS_VALIDAS].join(', ')}`

  const r = await chamarGemini(geminiApiKey, {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.8,
      maxOutputTokens: 1024,
      responseMimeType: 'application/json',
    },
  })

  if (!r.ok) {
    console.error('[copilot] gemini falhou:', r.status, r.body.slice(0, 300))
    return NextResponse.json({ erro: 'Não foi possível gerar os insights agora.' }, { status: 502 })
  }

  const texto = r.data.candidates?.[0]?.content?.parts?.[0]?.text || ''
  const insights = parseInsights(texto)
  if (!insights) {
    console.error('[copilot] resposta não parseável:', texto.slice(0, 300))
    return NextResponse.json({ erro: 'Não foi possível gerar os insights agora.' }, { status: 502 })
  }

  // Corrida entre duas abas: se outra já gravou a semana, aproveita a dela.
  const { error: insErr } = await supabase
    .from('insights_semanais')
    .insert({ loja_id: loja.id, semana, insights })
  if (insErr && insErr.code !== '23505') {
    console.error('[copilot] falha ao salvar insights:', insErr)
  }

  return NextResponse.json({ semana, insights, cache: false })
}
