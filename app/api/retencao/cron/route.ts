// Retenção automática — cron diário (Vercel Cron, ver vercel.json).
// Roda 3 estratégias numa passada só (Hobby só aceita cron diário):
//  1) Inativos há 7+ dias → toque "sentimos sua falta" (cooldown 7d).
//  2) Comerciante com pedidos pendentes e fora do app hoje → lembrete (cooldown 1d).
//  3) Segundas-feiras → relatório semanal por comerciante (cooldown 6d).
// Push só sai se VAPID estiver configurado; a notificação in-app sempre entra.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '../../../lib/supabase-admin'
import { carregarCooldowns, emCooldown, disparar, brl } from '../../../lib/retencao'
import { chamarGemini, textoDaResposta } from '../../../lib/gemini'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Insight semanal com IA (Gemini), curto e específico. Limitado por lote para
// não estourar o tempo do cron; cai no template quando indisponível/vazio.
async function insightSemanal(nome: string, atual: number, cresc: number, pedidos: number): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return null
  const prompt = `Você é consultor de um pequeno comércio ("${nome}"). Esta semana: ${brl(atual)} em vendas, ${pedidos} pedido(s), variação de ${cresc}% vs. a semana anterior. Escreva UMA frase curta (máx 22 palavras), motivadora e específica, com uma ação prática para a próxima semana. Sem emojis no início. Português.`
  try {
    const r = await chamarGemini(apiKey, { contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.7, maxOutputTokens: 80 } })
    const t = r.ok ? textoDaResposta(r.data).trim().replace(/\s+/g, ' ') : ''
    return t || null
  } catch { return null }
}

const hojeStr = () => new Date().toISOString().slice(0, 10)

export async function GET(req: NextRequest) {
  // Fail-closed: sem CRON_SECRET configurada, ninguém entra (o endpoint não
  // fica aberto se a env var sumir). O Vercel Cron manda "Authorization: Bearer
  // <CRON_SECRET>" automaticamente quando a env var existe.
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 })
  }

  const admin = createAdminClient()
  const cooldowns = await carregarCooldowns(admin)
  const hoje = hojeStr()
  const ehSegunda = new Date().getDay() === 1
  const resultado = { inativos: 0, pendentes: 0, semanais: 0 }

  // Mapa de última atividade (streaks.ultimo_dia) por user.
  const { data: streaks } = await admin.from('streaks').select('user_id, ultimo_dia')
  const ultimoDia = new Map<string, string>()
  for (const s of streaks || []) ultimoDia.set(s.user_id, s.ultimo_dia)

  // ---- 1) Inativos há 7+ dias ----
  const limite7 = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)
  for (const s of (streaks || []).slice(0, 500)) {
    if (!s.ultimo_dia || s.ultimo_dia > limite7) continue
    if (emCooldown(cooldowns, s.user_id, 'inativo', 7)) continue
    await disparar(admin, {
      userId: s.user_id, tipo: 'inativo', notifTipo: 'retencao',
      titulo: 'Sentimos sua falta 💛',
      mensagem: 'Tem novidade rolando na sua cidade. Volta pra Commerly e dá uma olhada!',
      link: '/',
    })
    resultado.inativos++
  }

  // Lojas (comerciantes) uma vez só, reaproveitada nas etapas 2 e 3.
  const { data: lojas } = await admin.from('lojas').select('id, user_id, nome').limit(500)
  const lojaUser = new Map<string, string>()
  const lojaNome = new Map<string, string>()
  for (const l of lojas || []) { lojaUser.set(l.id, l.user_id); lojaNome.set(l.id, l.nome) }

  // ---- 2) Pedidos pendentes ----
  const { data: pend } = await admin.from('pedidos_clientes')
    .select('loja_id').in('status', ['recebido', 'preparando'])
  const pendPorLoja = new Map<string, number>()
  for (const p of pend || []) pendPorLoja.set(p.loja_id, (pendPorLoja.get(p.loja_id) || 0) + 1)
  for (const [lojaId, qtd] of pendPorLoja) {
    const uid = lojaUser.get(lojaId)
    if (!uid) continue
    if (ultimoDia.get(uid) === hoje) continue // já está no app hoje
    if (emCooldown(cooldowns, uid, 'pendentes', 1)) continue
    await disparar(admin, {
      userId: uid, tipo: 'pendentes', notifTipo: 'retencao',
      titulo: `Você tem ${qtd} pedido${qtd > 1 ? 's' : ''} pendente${qtd > 1 ? 's' : ''} 🛍️`,
      mensagem: 'Abra o painel e mantenha seus clientes felizes com uma resposta rápida.',
      link: '/dashboard',
    })
    resultado.pendentes++
  }

  // ---- 3) Relatório semanal (segundas) ----
  if (ehSegunda && (lojas || []).length > 0) {
    const semana = new Date(Date.now() - 7 * 86400000).toISOString()
    const semanaAnt = new Date(Date.now() - 14 * 86400000).toISOString()
    const [{ data: vendas }, { data: pedidos }] = await Promise.all([
      admin.from('vendas').select('loja_id, valor_total, created_at').gte('created_at', semanaAnt),
      admin.from('pedidos_clientes').select('loja_id, total, created_at, status').neq('status', 'cancelado').gte('created_at', semanaAnt),
    ])
    type Ag = { atual: number; ant: number; pedidos: number }
    const ag = new Map<string, Ag>()
    const add = (lojaId: string, valor: number, quando: string, ehPedido: boolean) => {
      if (!ag.has(lojaId)) ag.set(lojaId, { atual: 0, ant: 0, pedidos: 0 })
      const a = ag.get(lojaId)!
      if (quando >= semana) { a.atual += valor; if (ehPedido) a.pedidos++ } else { a.ant += valor }
    }
    for (const v of vendas || []) add(v.loja_id, Number(v.valor_total) || 0, v.created_at, false)
    for (const p of pedidos || []) add(p.loja_id, Number(p.total) || 0, p.created_at, true)

    // IA só nas lojas com movimento e até um teto por execução (protege o tempo
    // do cron); as demais recebem o resumo por template, como antes.
    let orcamentoIA = 25
    for (const l of lojas || []) {
      const a = ag.get(l.id) || { atual: 0, ant: 0, pedidos: 0 }
      if (emCooldown(cooldowns, l.user_id, 'semanal', 6)) continue
      const cresc = a.ant > 0 ? Math.round(((a.atual - a.ant) / a.ant) * 100) : (a.atual > 0 ? 100 : 0)
      const tendencia = cresc > 0 ? `📈 ${cresc}% vs. semana anterior` : cresc < 0 ? `📉 ${cresc}% vs. semana anterior` : 'estável'
      const resumo = `${brl(a.atual)} em vendas · ${a.pedidos} pedido${a.pedidos !== 1 ? 's' : ''} · ${tendencia}.`
      let insight: string | null = null
      if (a.atual > 0 && orcamentoIA > 0) {
        insight = await insightSemanal(l.nome, a.atual, cresc, a.pedidos)
        if (insight) orcamentoIA--
      }
      await disparar(admin, {
        userId: l.user_id, tipo: 'semanal', notifTipo: 'relatorio',
        titulo: '📊 Seu relatório da semana',
        mensagem: `${resumo} ${insight || 'Bora crescer essa semana!'}`,
        link: '/financeiro',
      })
      resultado.semanais++
    }
  }

  return NextResponse.json({ ok: true, ...resultado, segunda: ehSegunda })
}
