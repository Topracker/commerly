import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function POST(request: NextRequest) {
  const { pergunta } = await request.json()
  if (!pergunta?.trim()) return NextResponse.json({ erro: 'Pergunta vazia' }, { status: 400 })

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll() {},
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 })

  const { data: loja } = await supabase.from('lojas').select('*').eq('user_id', user.id).single()
  if (!loja) return NextResponse.json({ erro: 'Loja não encontrada' }, { status: 404 })

  const trintaDiasAtras = new Date()
  trintaDiasAtras.setDate(trintaDiasAtras.getDate() - 30)
  const desde = trintaDiasAtras.toISOString()

  const [vendasRes, gastosRes, produtosRes, fiadoRes] = await Promise.all([
    supabase.from('vendas').select('*, produtos(nome)').eq('loja_id', loja.id).gte('created_at', desde).order('created_at', { ascending: false }).limit(100),
    supabase.from('gastos').select('*').eq('loja_id', loja.id).gte('created_at', desde).order('created_at', { ascending: false }),
    supabase.from('produtos').select('*').eq('loja_id', loja.id),
    supabase.from('fiado').select('*').eq('loja_id', loja.id).eq('pago', false).order('created_at', { ascending: false }),
  ])

  const vendas = vendasRes.data || []
  const gastos = gastosRes.data || []
  const produtos = produtosRes.data || []
  const fiado = fiadoRes.data || []

  const totalFaturamento = vendas.reduce((a, v) => a + (v.valor_total || 0), 0)
  const totalLucro = vendas.reduce((a, v) => a + (v.lucro || 0), 0)
  const totalGastos = gastos.reduce((a, g) => a + (g.valor || 0), 0)
  const totalFiado = fiado.reduce((a, f) => a + (f.valor || 0), 0)

  const topMap: Record<string, { nome: string; quantidade: number; lucro: number }> = {}
  vendas.forEach(v => {
    const nome = v.produtos?.nome || v.descricao || 'Produto'
    if (!topMap[nome]) topMap[nome] = { nome, quantidade: 0, lucro: 0 }
    topMap[nome].quantidade += v.quantidade || 1
    topMap[nome].lucro += v.lucro || 0
  })
  const top5 = Object.values(topMap).sort((a, b) => b.quantidade - a.quantidade).slice(0, 5)

  const estoqueBaixo = produtos.filter(p => p.quantidade <= (p.quantidade_minima || 0))

  const contexto = `Você é um assistente de negócios para a loja "${loja.nome}" (tipo: ${loja.tipo}).
Responda de forma clara, objetiva e em português brasileiro. Seja direto, use os dados reais abaixo.

RESUMO FINANCEIRO (ÚLTIMOS 30 DIAS):
- Faturamento: R$ ${totalFaturamento.toFixed(2)}
- Lucro bruto: R$ ${totalLucro.toFixed(2)}
- Gastos: R$ ${totalGastos.toFixed(2)}
- Resultado líquido: R$ ${(totalLucro - totalGastos).toFixed(2)}
- Fiado pendente: R$ ${totalFiado.toFixed(2)} (${fiado.length} clientes)
- Vendas registradas: ${vendas.length}

TOP 5 PRODUTOS MAIS VENDIDOS:
${top5.length > 0 ? top5.map((p, i) => `${i + 1}. ${p.nome}: ${p.quantidade} unidades, R$ ${p.lucro.toFixed(2)} de lucro`).join('\n') : 'Nenhuma venda registrada'}

ESTOQUE ATUAL (${produtos.length} produtos):
${produtos.slice(0, 20).map(p => `- ${p.nome}: ${p.quantidade} un. (mínimo: ${p.quantidade_minima || 0})`).join('\n')}${produtos.length > 20 ? `\n... e mais ${produtos.length - 20} produtos` : ''}

${estoqueBaixo.length > 0 ? `PRODUTOS COM ESTOQUE BAIXO (${estoqueBaixo.length}):\n${estoqueBaixo.map(p => `- ${p.nome}: ${p.quantidade} un.`).join('\n')}` : 'ESTOQUE: Todos os produtos estão acima do mínimo.'}

FIADO PENDENTE (${fiado.length} clientes):
${fiado.slice(0, 10).map(f => `- ${f.cliente_nome}: R$ ${f.valor.toFixed(2)} — ${f.descricao}`).join('\n')}${fiado.length > 10 ? `\n... e mais ${fiado.length - 10} registros` : ''}

ÚLTIMAS 10 VENDAS:
${vendas.slice(0, 10).map(v => `- ${v.produtos?.nome || v.descricao || 'Produto'}: ${v.quantidade || 1}x por R$ ${(v.valor_total || 0).toFixed(2)} (${v.forma_pagamento || 'N/A'}) em ${new Date(v.created_at).toLocaleDateString('pt-BR')}`).join('\n')}

GASTOS RECENTES:
${gastos.slice(0, 10).map(g => `- ${g.descricao}: R$ ${(g.valor || 0).toFixed(2)} em ${new Date(g.created_at).toLocaleDateString('pt-BR')}`).join('\n')}

Pergunta do comerciante: ${pergunta}`

  const geminiApiKey = process.env.GEMINI_API_KEY
  if (!geminiApiKey) return NextResponse.json({ erro: 'Assistente não configurado (GEMINI_API_KEY ausente)' }, { status: 500 })

  const geminiRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${geminiApiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: contexto }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
      }),
    }
  )

  if (!geminiRes.ok) {
    const errBody = await geminiRes.text()
    console.error('Gemini API error:', geminiRes.status, errBody)
    const msg = geminiRes.status === 429
      ? 'Limite de consultas atingido. Tente novamente em alguns minutos.'
      : 'Erro ao consultar o assistente. Tente novamente.'
    return NextResponse.json({ erro: msg }, { status: 500 })
  }

  const geminiData = await geminiRes.json()
  const resposta = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || 'Não foi possível gerar uma resposta.'

  return NextResponse.json({ resposta })
}
