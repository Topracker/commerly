'use client'
import { useEffect, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import { useNicho } from '../hooks/useNicho'
import { AppLayout } from '../components/AppLayout'
import { Toast } from '../components/Toast'
import { CopilotCard } from '../components/CopilotCard'
import { AcademyCard } from '../components/AcademyCard'
import { isDelivery } from '../lib/pedidosClientes'
import { carregarAgendamentosProximos, minutosAteAgendamento, type Agendamento } from '../lib/nicheStore'
import { calcularCommerlyScore, type CommerlyScore } from '../lib/commerlyScore'
import {
  ShoppingBag, ChevronRight, Clock, Gauge, Package, Lightbulb, ArrowRight, Trophy, Moon, Rss,
  TrendingUp, TrendingDown, Wallet,
} from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'

type RankProduto = { id: string | null; nome: string; quantidade: number; faturamento: number }
type Ranking = { top: RankProduto[]; parados: { id: string; nome: string }[] }

type GraficoDia = { dia: string; faturamento: number }

// "em X minutos" amigável para os lembretes de agendamento (0–120 min).
function rotuloAntecedencia(min: number): string {
  if (min <= 0) return 'agora'
  if (min < 60) return `em ${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m === 0 ? `em ${h}h` : `em ${h}h${String(m).padStart(2, '0')}`
}

const BADGES = [
  {
    tipo: 'ascensao',
    nome: 'Comerciante em Ascensão',
    emoji: '🏆',
    threshold: 5000,
    bg: 'bg-yellow-950',
    border: 'border-yellow-800',
    label: 'text-yellow-300',
  },
  {
    tipo: 'elite',
    nome: 'Comerciante de Elite',
    emoji: '💎',
    threshold: 10000,
    bg: 'bg-purple-950',
    border: 'border-purple-800',
    label: 'text-purple-300',
  },
] as const

export default function Dashboard() {
  const { loja, loading, supabase, sair } = useAuth()
  const { toast, mostrarToast } = useToast()
  const { nicho, modulos } = useNicho(loja)

  const [faturamento, setFaturamento] = useState(0)
  const [lucro, setLucro] = useState(0)
  const [gastos, setGastos] = useState(0)
  const [estoqueBaixo, setEstoqueBaixo] = useState<any[]>([])
  const [ultimasVendas, setUltimasVendas] = useState<any[]>([])
  const [totalFiado, setTotalFiado] = useState(0)
  const [periodo, setPeriodo] = useState('mes')
  const [carregando, setCarregando] = useState(false)
  const [mpConectado, setMpConectado] = useState(false)
  const [graficoData, setGraficoData] = useState<GraficoDia[]>([])
  const [pedidosAtivos, setPedidosAtivos] = useState(0)

  // Commerly Score (saúde do negócio 0-100) + Ranking de produtos
  const [score, setScore] = useState<CommerlyScore | null>(null)
  const [ranking, setRanking] = useState<Ranking>({ top: [], parados: [] })

  // Lembretes: agendamentos nas próximas 2h (só nichos com módulo de agenda).
  const temAgenda = modulos.some(m => m.key === 'agenda')
  const [agProximos, setAgProximos] = useState<Agendamento[]>([])

  // Pedidos online (delivery) do mês — card dedicado
  const [pedidosMesQtd, setPedidosMesQtd] = useState(0)
  const [pedidosMesTotal, setPedidosMesTotal] = useState(0)
  const [pedidosMesAndamento, setPedidosMesAndamento] = useState(0)

  // Metas e conquistas
  const [faturamentoMes, setFaturamentoMes] = useState(0)
  const [metaMensal, setMetaMensal] = useState(5000)
  const [conquistas, setConquistas] = useState<string[]>([])
  const [novosBadges, setNovosBadges] = useState<string[]>([])

  useEffect(() => {
    if (loja) {
      setMetaMensal(Number(loja.meta_mensal) || 5000)
      carregarDados()
      supabase
        .from('mercadopago_conexoes')
        .select('id')
        .eq('loja_id', loja.id)
        .maybeSingle()
        .then(({ data }) => setMpConectado(!!data))
      if (isDelivery(loja.tipo)) {
        supabase
          .from('pedidos_clientes')
          .select('id', { count: 'exact', head: true })
          .eq('loja_id', loja.id)
          .not('status', 'in', '(entregue,cancelado)')
          .then(({ count }) => setPedidosAtivos(count || 0))
      }
    }
  }, [loja, periodo])

  // Lembretes de agendamento: carrega no mount e revalida a cada 60s para os
  // rótulos "em X min" e a janela de 2h ficarem sempre atualizados.
  useEffect(() => {
    if (!loja || !temAgenda) { setAgProximos([]); return }
    let ativo = true
    const buscar = () =>
      carregarAgendamentosProximos(loja.id)
        .then(l => { if (ativo) setAgProximos(l) })
        .catch(() => { /* silencioso: não atrapalha o dashboard */ })
    buscar()
    const iv = setInterval(buscar, 60_000)
    return () => { ativo = false; clearInterval(iv) }
  }, [loja, temAgenda])

  // Limpa animação dos badges novos após 3s
  useEffect(() => {
    if (novosBadges.length === 0) return
    const t = setTimeout(() => setNovosBadges([]), 3000)
    return () => clearTimeout(t)
  }, [novosBadges])

  async function carregarDados() {
    setCarregando(true)
    const agora = new Date()

    let desde = new Date()
    if (periodo === 'hoje') desde.setHours(0, 0, 0, 0)
    else if (periodo === 'semana') desde.setDate(agora.getDate() - 7)
    else desde.setDate(1)

    const seteAtras = new Date()
    seteAtras.setDate(agora.getDate() - 6)
    seteAtras.setHours(0, 0, 0, 0)

    // Janela de 14 dias — o Score compara os últimos 7 dias com os 7 anteriores
    // (tendência de crescimento).
    const quatorzeAtras = new Date()
    quatorzeAtras.setDate(agora.getDate() - 13)
    quatorzeAtras.setHours(0, 0, 0, 0)

    // Janela de 30 dias — clientes/recorrência/novos e taxa de entrega do Score.
    const trintaAtras = new Date()
    trintaAtras.setDate(agora.getDate() - 30)
    trintaAtras.setHours(0, 0, 0, 0)

    const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1)

    // Data mais antiga que precisamos dos pedidos online: cobre o período do
    // card, a janela de tendência (14d) e o mês (meta) numa única query;
    // filtramos por range em JS depois.
    const menorData = new Date(Math.min(desde.getTime(), quatorzeAtras.getTime(), inicioMes.getTime()))

    const [vendasRes, gastosRes, produtosRes, recentesRes, fiadoRes, vendasSemanaRes, vendasMesRes, gastosMesRes, conquistasRes, pedidosRes, avaliacoesRes, pedidosScoreRes, vendas30Res] = await Promise.all([
      // Faturamento, lucro bruto, top produtos: todas as origens
      supabase.from('vendas').select('*, produtos(nome)').eq('loja_id', loja.id).gte('created_at', desde.toISOString()),
      supabase.from('gastos').select('*').eq('loja_id', loja.id).gte('created_at', desde.toISOString()),
      supabase.from('produtos').select('*').eq('loja_id', loja.id),
      // Histórico: todas as origens
      supabase.from('vendas').select('*, produtos(nome)').eq('loja_id', loja.id).order('created_at', { ascending: false }).limit(5),
      supabase.from('fiado').select('*').eq('loja_id', loja.id).eq('pago', false),
      // Tendência: 14 dias de vendas (o gráfico usa só os últimos 7).
      supabase.from('vendas').select('valor_total, created_at').eq('loja_id', loja.id).gte('created_at', quatorzeAtras.toISOString()),
      // Meta mensal + resultado do mês para o Score (lucro do mês).
      supabase.from('vendas').select('valor_total, lucro').eq('loja_id', loja.id).gte('created_at', inicioMes.toISOString()),
      // Gastos do mês para o resultado líquido do Score.
      supabase.from('gastos').select('valor').eq('loja_id', loja.id).gte('created_at', inicioMes.toISOString()),
      supabase.from('conquistas').select('tipo').eq('loja_id', loja.id),
      // Pedidos online (delivery) — faturamento entra no card, gráfico e meta.
      // Cancelados não contam como faturamento.
      supabase.from('pedidos_clientes').select('total, status, created_at').eq('loja_id', loja.id).neq('status', 'cancelado').gte('created_at', menorData.toISOString()),
      // Avaliações da loja (satisfação, pilar Clientes do Score).
      supabase.from('avaliacoes_lojas').select('nota').eq('loja_id', loja.id),
      // Pedidos (todos, com cancelados) — clientes, recorrência e clientes novos
      // (1ª compra nos últimos 30d) do Score. Histórico completo para saber quem
      // é realmente novo; a taxa de entrega filtra os últimos 30d em JS.
      supabase.from('pedidos_clientes').select('cliente_id, status, created_at').eq('loja_id', loja.id),
      // Produtos vendidos nos últimos 30d — para achar os "parados" (encalhados).
      supabase.from('vendas').select('produto_id').eq('loja_id', loja.id).gte('created_at', trintaAtras.toISOString()),
    ])

    if (vendasRes.error) mostrarToast('Erro ao carregar vendas', 'erro')
    if (gastosRes.error) mostrarToast('Erro ao carregar gastos', 'erro')

    const vendas = vendasRes.data || []
    const gastosData = gastosRes.data || []
    const pedidosOnline = pedidosRes.data || []

    // Pedidos online do período selecionado (mesmo range do card de faturamento).
    const fatPedidosPeriodo = pedidosOnline
      .filter((p: any) => new Date(p.created_at) >= desde)
      .reduce((a: number, p: any) => a + Number(p.total || 0), 0)

    // Faturamento = vendas manuais/integrações + pedidos online do período.
    setFaturamento(vendas.reduce((a: number, v: any) => a + v.valor_total, 0) + fatPedidosPeriodo)
    setLucro(vendas.reduce((a: number, v: any) => a + v.lucro, 0))
    setGastos(gastosData.reduce((a: number, g: any) => a + g.valor, 0))

    const produtos = produtosRes.data || []

    // Ranking de produtos do período — mais vendidos por faturamento.
    const rankMap = new Map<string, RankProduto>()
    vendas.forEach((v: any) => {
      const nome = v.produtos?.nome
      // Ignora vendas sem produto vinculado (ex: pagamentos via integração).
      if (!v.produto_id || !nome) return
      const cur = rankMap.get(v.produto_id) ?? { id: v.produto_id, nome, quantidade: 0, faturamento: 0 }
      cur.quantidade += Number(v.quantidade) || 0
      cur.faturamento += Number(v.valor_total) || 0
      rankMap.set(v.produto_id, cur)
    })
    const top = [...rankMap.values()].sort((a, b) => b.faturamento - a.faturamento).slice(0, 5)

    // Produtos parados: têm estoque mas não venderam nos últimos 30 dias.
    const vendidos30 = new Set((vendas30Res.data || []).map((v: any) => v.produto_id).filter(Boolean))
    const parados = produtos
      .filter((p: any) => (p.quantidade ?? 0) > 0 && !vendidos30.has(p.id))
      .map((p: any) => ({ id: p.id as string, nome: p.nome as string }))
      .slice(0, 5)
    setRanking({ top, parados })
    setEstoqueBaixo(produtos.filter((p: any) => p.quantidade <= p.quantidade_minima))
    setUltimasVendas(recentesRes.data || [])
    setTotalFiado((fiadoRes.data || []).reduce((a: number, f: any) => a + f.valor, 0))

    // Gráfico 7 dias
    const diasMap: Record<string, GraficoDia> = {}
    for (let i = 6; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const isoKey = d.toISOString().slice(0, 10)
      diasMap[isoKey] = { dia: d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }), faturamento: 0 }
    }
    for (const v of (vendasSemanaRes.data || [])) {
      const isoKey = (v.created_at as string).slice(0, 10)
      if (diasMap[isoKey]) diasMap[isoKey].faturamento += v.valor_total
    }
    // Pedidos online também entram no gráfico de faturamento dos 7 dias.
    for (const p of pedidosOnline) {
      if (new Date(p.created_at) < seteAtras) continue
      const isoKey = (p.created_at as string).slice(0, 10)
      if (diasMap[isoKey]) diasMap[isoKey].faturamento += Number(p.total || 0)
    }
    setGraficoData(Object.values(diasMap))

    // Pedidos online do mês (card dedicado + meta + desconto).
    const pedidosMes = pedidosOnline.filter((p: any) => new Date(p.created_at) >= inicioMes)
    const fatPedidosMes = pedidosMes.reduce((a: number, p: any) => a + Number(p.total || 0), 0)
    setPedidosMesQtd(pedidosMes.length)
    setPedidosMesTotal(fatPedidosMes)
    // "Em andamento" = ainda não entregue (cancelados já foram excluídos na query).
    setPedidosMesAndamento(pedidosMes.filter((p: any) => p.status !== 'entregue').length)

    // Progresso da meta mensal — soma vendas + pedidos online do mês.
    const fatMes = (vendasMesRes.data || []).reduce((a: number, v: any) => a + v.valor_total, 0) + fatPedidosMes
    setFaturamentoMes(fatMes)

    // Conquistas
    const conquistasExistentes = (conquistasRes.data || []).map((c: any) => c.tipo)
    const meta = Number(loja.meta_mensal) || 5000
    const novos: string[] = []

    for (const badge of BADGES) {
      if (fatMes >= badge.threshold && !conquistasExistentes.includes(badge.tipo)) {
        const { error } = await supabase
          .from('conquistas')
          .insert({ loja_id: loja.id, tipo: badge.tipo })
        if (!error) {
          novos.push(badge.tipo)
          conquistasExistentes.push(badge.tipo)
          mostrarToast(`🎉 Conquista desbloqueada: ${badge.nome}!`, 'sucesso')
        }
      }
    }

    setConquistas(conquistasExistentes)
    setNovosBadges(novos)
    setMetaMensal(meta)

    // ---- Commerly Score ----
    // Tendência: últimos 7 dias vs. os 7 anteriores (vendas + pedidos online).
    const vend14 = vendasSemanaRes.data || []
    const somaVendas = (ini: Date, fim?: Date) => vend14
      .filter((v: any) => { const t = new Date(v.created_at); return t >= ini && (!fim || t < fim) })
      .reduce((a: number, v: any) => a + Number(v.valor_total || 0), 0)
    const somaPedidos = (ini: Date, fim?: Date) => pedidosOnline
      .filter((p: any) => { const t = new Date(p.created_at); return t >= ini && (!fim || t < fim) })
      .reduce((a: number, p: any) => a + Number(p.total || 0), 0)
    const fatUltimos7 = somaVendas(seteAtras) + somaPedidos(seteAtras)
    const fatAnteriores7 = somaVendas(quatorzeAtras, seteAtras) + somaPedidos(quatorzeAtras, seteAtras)

    // Resultado líquido do mês (lucro das vendas do mês - gastos do mês).
    const lucroMes = (vendasMesRes.data || []).reduce((a: number, v: any) => a + Number(v.lucro || 0), 0)
    const gastosMes = (gastosMesRes.data || []).reduce((a: number, g: any) => a + Number(g.valor || 0), 0)

    // Clientes (histórico completo) — agrupa por cliente para volume, recorrência
    // e quem é novo (1ª compra nos últimos 30d). Cancelados não contam.
    const pedScore = (pedidosScoreRes.data || []).filter((p: any) => p.cliente_id && p.status !== 'cancelado')
    const porCliente = new Map<string, { qtd: number; primeira: number }>()
    for (const p of pedScore) {
      const t = new Date(p.created_at).getTime()
      const cur = porCliente.get(p.cliente_id) ?? { qtd: 0, primeira: t }
      cur.qtd += 1
      cur.primeira = Math.min(cur.primeira, t)
      porCliente.set(p.cliente_id, cur)
    }
    const trintaMs = trintaAtras.getTime()
    const clientesNovos30 = [...porCliente.values()].filter(c => c.primeira >= trintaMs).length

    // Taxa de entrega (últimos 30d) — entregues vs. cancelados.
    const ped30 = (pedidosScoreRes.data || []).filter((p: any) => new Date(p.created_at).getTime() >= trintaMs)
    const pedidosEntregues = ped30.filter((p: any) => p.status === 'entregue').length
    const pedidosCancelados = ped30.filter((p: any) => p.status === 'cancelado').length

    // Satisfação — avaliações da loja.
    const notas = (avaliacoesRes.data || []).map((a: any) => Number(a.nota)).filter((n: number) => !isNaN(n))
    const notaMedia = notas.length ? notas.reduce((a: number, b: number) => a + b, 0) / notas.length : null

    setScore(calcularCommerlyScore({
      faturamentoMes: fatMes,
      metaMensal: meta,
      resultadoLiquido: lucroMes - gastosMes,
      totalClientes: porCliente.size,
      clientesRecorrentes: [...porCliente.values()].filter(c => c.qtd >= 2).length,
      notaMedia,
      totalAvaliacoes: notas.length,
      produtosBaixo: produtos.filter((p: any) => p.quantidade <= p.quantidade_minima).length,
      produtosTotal: produtos.length,
      pedidosEntregues,
      pedidosCancelados,
      fatUltimos7,
      fatAnteriores7,
      clientesNovos30,
    }))

    setCarregando(false)
  }

  if (loading) return (
    <main className="min-h-screen bg-gray-950 flex items-center justify-center">
      <p className="text-gray-400">Carregando...</p>
    </main>
  )
  if (!loja) return null

  const resultadoLiquido = lucro - gastos
  const pctMeta = Math.min(Math.round((faturamentoMes / metaMensal) * 100), 100)
  const corBarra = pctMeta >= 100 ? 'bg-green-500' : pctMeta >= 70 ? 'bg-yellow-400' : 'bg-blue-500'

  // Progresso até o desconto de fidelidade na mensalidade (10% a partir de
  // R$5.000 e 15% a partir de R$10.000 de faturamento no mês).
  const reais = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
  const descontoFidelidade =
    faturamentoMes >= 10000
      ? { texto: '🎉 Você garantiu 15% de desconto na próxima mensalidade!', cor: 'text-green-400' }
      : faturamentoMes >= 5000
        ? { texto: `🎉 10% de desconto garantido! Faltam ${reais(10000 - faturamentoMes)} para 15% off`, cor: 'text-green-400' }
        : { texto: `Faltam ${reais(5000 - faturamentoMes)} para 10% de desconto na mensalidade`, cor: 'text-gray-400' }

  // Ação recomendada do Score leva à tela do pilar mais fraco.
  const ROTA_PILAR: Record<string, string> = {
    financeiro: '/gastos',
    clientes: '/clientes',
    operacao: '/produtos',
    crescimento: '/produtos',
  }
  const rotuloPeriodo = periodo === 'hoje' ? 'hoje' : periodo === 'semana' ? 'na semana' : 'no mês'

  return (
    <AppLayout loja={loja} sair={sair} titulo="Dashboard" maxWidth="max-w-3xl">
      <Toast toast={toast} />

      {/* Header da loja: identidade + plano + Score em destaque */}
      <header className="anima-subir bg-gradient-to-br from-card to-fundo border border-borda rounded-2xl p-5 mb-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl overflow-hidden bg-elevado flex items-center justify-center shrink-0 ring-1 ring-borda">
            {loja.fotos_fachada?.[0]
              ? <img src={loja.fotos_fachada[0]} alt="" className="w-full h-full object-cover" />
              : <span className="text-2xl">{nicho.emoji}</span>}
          </div>

          <div className="flex-1 min-w-0">
            <h2 className="font-display text-xl font-bold text-white truncate">{loja.nome}</h2>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="text-gray-400 text-xs">{loja.tipo}</span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                loja.plano === 'ativo'
                  ? 'bg-acento/15 text-acento border-acento/40'
                  : loja.plano === 'trial'
                  ? 'bg-amber-500/15 text-amber-300 border-amber-500/40'
                  : 'bg-gray-800 text-gray-400 border-gray-700'
              }`}>
                {loja.plano === 'ativo' ? 'PLANO ATIVO' : loja.plano === 'trial' ? 'TESTE' : 'INATIVO'}
              </span>
              {loja.fundador && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/40">
                  FUNDADOR
                </span>
              )}
            </div>
          </div>

          {/* Score em destaque: anel + nota, clicável para os detalhes abaixo. */}
          {score && (
            <a href="#commerly-score" className="shrink-0 text-center group" aria-label="Ver o Commerly Score">
              <div className="relative w-[68px] h-[68px]">
                <svg width="68" height="68" viewBox="0 0 68 68" className="-rotate-90">
                  <circle cx="34" cy="34" r="29" fill="none" stroke="var(--color-borda)" strokeWidth="6" />
                  <circle
                    cx="34" cy="34" r="29" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round"
                    className={`${score.cor} transition-all duration-700`}
                    strokeDasharray={2 * Math.PI * 29}
                    strokeDashoffset={2 * Math.PI * 29 * (1 - score.total / 100)}
                  />
                </svg>
                <span className={`absolute inset-0 flex items-center justify-center text-lg font-bold ${score.cor}`}>
                  {score.total}
                </span>
              </div>
              <span className="text-gray-500 text-[10px] group-hover:text-gray-300 transition">Score</span>
            </a>
          )}
        </div>
      </header>

      {/* Lembretes de agendamento — próximas 2 horas */}
      {agProximos.length > 0 && (
        <button
          onClick={() => window.location.href = '/agenda'}
          className="w-full mb-6 bg-amber-950 border border-amber-800 hover:border-amber-600 rounded-2xl p-4 flex items-start gap-3 transition text-left"
        >
          <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center shrink-0">
            <Clock size={20} className="text-amber-300" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-amber-200 font-semibold text-sm mb-1">
              {agProximos.length === 1 ? 'Agendamento chegando' : `${agProximos.length} agendamentos nas próximas 2h`}
            </p>
            <div className="flex flex-col gap-0.5">
              {agProximos.map(a => (
                <p key={a.id} className="text-amber-100/90 text-sm truncate">
                  ⏰ Agendamento <strong>{rotuloAntecedencia(minutosAteAgendamento(a))}</strong> com {a.cliente} — {a.servico}
                </p>
              ))}
            </div>
          </div>
          <ChevronRight size={20} className="text-amber-500/70 shrink-0" />
        </button>
      )}

      {isDelivery(loja.tipo) && (
        <button
          onClick={() => window.location.href = '/pedidos'}
          className="w-full mb-6 bg-gray-900 border border-gray-800 hover:border-acento/60 rounded-2xl p-4 flex items-center gap-3 transition text-left"
        >
          <div className="relative shrink-0">
            <div className="w-11 h-11 rounded-xl bg-acento/15 flex items-center justify-center">
              <ShoppingBag size={20} className="text-acento" />
            </div>
            {pedidosAtivos > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-green-500 text-white text-xs rounded-full min-w-[20px] h-5 px-1 flex items-center justify-center font-bold">
                {pedidosAtivos}
              </span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white font-semibold">Pedidos online</p>
            <p className="text-gray-400 text-sm">
              {pedidosAtivos > 0 ? `${pedidosAtivos} ${pedidosAtivos === 1 ? 'pedido em andamento' : 'pedidos em andamento'}` : 'Nenhum pedido em andamento'}
            </p>
          </div>
          <ChevronRight size={20} className="text-gray-500 shrink-0" />
        </button>
      )}

      {/* Alvo do item "Commerly Score" no menu. Fica fora do `score &&` para a
          âncora existir mesmo enquanto o Score ainda está carregando. */}
      <div id="commerly-score" className="scroll-mt-6" />

      {/* Commerly Score — saúde do negócio em 4 pilares */}
      {score && (
        <div className="bg-gradient-to-br from-gray-900 to-gray-900/40 border border-gray-800 rounded-2xl p-5 mb-6">
          <div className="flex items-center gap-4 mb-4">
            <div className="relative shrink-0 w-[72px] h-[72px]">
              <svg width="72" height="72" viewBox="0 0 72 72" className="-rotate-90">
                <circle cx="36" cy="36" r="30" fill="none" stroke="var(--color-gray-800)" strokeWidth="8" />
                <circle
                  cx="36" cy="36" r="30" fill="none" stroke="currentColor" strokeWidth="8" strokeLinecap="round"
                  className={`${score.cor} transition-all duration-700`}
                  strokeDasharray={2 * Math.PI * 30}
                  strokeDashoffset={2 * Math.PI * 30 * (1 - score.total / 100)}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className={`text-xl font-bold ${score.cor}`}>{score.total}</span>
              </div>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-gray-400 text-xs mb-0.5"><Gauge size={13} /> Commerly Score</div>
              <p className={`text-lg font-bold ${score.cor}`}>{score.nivel}</p>
              <p className="text-gray-500 text-xs">Saúde do seu negócio em 4 pilares</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 mb-4">
            {score.pilares.map(p => {
              const corBar = p.pontos >= 18 ? 'bg-acento' : p.pontos >= 12 ? 'bg-amber-400' : 'bg-red-400'
              return (
                <div key={p.chave}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-gray-300">{p.emoji} {p.nome}</span>
                    <span className="text-gray-400 font-semibold">{p.pontos}<span className="text-gray-600">/25</span></span>
                  </div>
                  <div className="w-full bg-gray-800 rounded-full h-1.5 overflow-hidden">
                    <div className={`h-1.5 rounded-full transition-all duration-700 ${corBar}`} style={{ width: `${(p.pontos / 25) * 100}%` }} />
                  </div>
                </div>
              )
            })}
          </div>

          <div className="flex items-start gap-2 bg-gray-950/60 rounded-xl p-3 mb-3">
            <Lightbulb size={15} className="text-amber-300 shrink-0 mt-0.5" />
            <p className="text-gray-300 text-xs leading-relaxed">{score.insight}</p>
          </div>

          <button
            onClick={() => { const r = ROTA_PILAR[score.pilarMaisFraco]; if (r) window.location.href = r }}
            className="w-full flex items-center gap-2 text-left group"
          >
            <ArrowRight size={14} className="text-blue-400 shrink-0" />
            <p className="text-blue-300 text-xs group-hover:text-blue-200 flex-1">{score.acao}</p>
          </button>
        </div>
      )}

      <CopilotCard />

      {/* Feed social: atalho para publicar */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 mb-6 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-acento/15 flex items-center justify-center shrink-0">
          <Rss size={17} className="text-acento" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white font-bold text-sm">Feed da loja</p>
          <p className="text-gray-400 text-xs">Poste uma foto ou vídeo e apareça no feed dos clientes.</p>
        </div>
        <button
          onClick={() => (window.location.href = '/posts')}
          className="shrink-0 bg-azul hover:brightness-110 text-white text-xs font-semibold px-3 py-2 rounded-lg transition"
        >
          Criar post
        </button>
      </div>

      <AcademyCard lojaId={loja.id} />

      <div className="flex gap-2 mb-6">
        {[['hoje', 'Hoje'], ['semana', 'Semana'], ['mes', 'Mês']].map(([val, label]) => (
          <button key={val} onClick={() => setPeriodo(val)}
            className={`px-3 py-2 rounded-xl text-sm font-semibold transition ${periodo === val ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* Atalhos personalizados pro nicho do comerciante */}
      <div className="mb-6">
        <p className="text-gray-400 text-xs uppercase font-semibold mb-2">{nicho.emoji} Atalhos do seu negócio</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {modulos.map(m => (
            <button
              key={m.path}
              onClick={() => window.location.href = m.path}
              className="bg-gray-900 hover:bg-gray-800 rounded-2xl p-4 text-left transition flex flex-col gap-1"
            >
              <span className="text-2xl">{m.emoji}</span>
              <p className="text-white font-semibold text-sm">{m.label}</p>
              <p className="text-gray-500 text-xs">{m.descricao}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Alerta de estoque em destaque para nichos focados em estoque */}
      {nicho.destaque === 'estoque' && estoqueBaixo.length > 0 && (
        <div className="bg-red-950 border border-red-800 rounded-2xl p-4 mb-6">
          <p className="text-red-300 font-semibold mb-2">⚠️ Estoque baixo — reponha logo</p>
          {estoqueBaixo.map(p => (
            <p key={p.id} className="text-red-400 text-sm">{p.nome} — {p.quantidade} unidades</p>
          ))}
        </div>
      )}

      {carregando ? (
        <div className="text-center py-12 text-gray-500">Atualizando...</div>
      ) : (
        <>
          {/* Meta mensal */}
          <div className="bg-gray-900 rounded-2xl p-5 mb-3">
            <div className="flex justify-between items-center mb-2">
              <p className="text-white font-semibold text-sm">🎯 Meta do mês</p>
              <p className={`text-sm font-bold ${pctMeta >= 100 ? 'text-green-400' : 'text-gray-300'}`}>{pctMeta}%</p>
            </div>
            <div className="w-full bg-gray-800 rounded-full h-3 mb-2 overflow-hidden">
              <div
                className={`h-3 rounded-full transition-all duration-700 ${corBarra}`}
                style={{ width: `${pctMeta}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-gray-500">
              <span>R$ {faturamentoMes.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
              <span>Meta: R$ {metaMensal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
            </div>
            <p className="text-gray-600 text-xs mt-2">Conta todas as vendas do mês (manuais + integrações + pedidos online)</p>
            <div className="border-t border-gray-800 mt-3 pt-3 flex items-center gap-2">
              <span className="text-base">🏷️</span>
              <p className={`text-xs font-medium ${descontoFidelidade.cor}`}>{descontoFidelidade.texto}</p>
            </div>
          </div>

          {/* Gráfico 7 dias */}
          <div className="bg-gray-900 rounded-2xl p-5 mb-3">
            <p className="text-white font-semibold mb-4">Faturamento — últimos 7 dias</p>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={graficoData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                {/* Cores do gráfico via var() para acompanharem o tema. */}
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-gray-800)" vertical={false} />
                <XAxis dataKey="dia" tick={{ fill: 'var(--color-gray-500)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'var(--color-gray-500)', fontSize: 11 }} axisLine={false} tickLine={false}
                  tickFormatter={(v) => `R$${v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v}`} />
                <Tooltip
                  contentStyle={{ backgroundColor: 'var(--color-gray-900)', border: '1px solid var(--color-gray-700)', borderRadius: 8 }}
                  labelStyle={{ color: 'var(--tema-tinta)', fontSize: 12 }}
                  formatter={(value) => [`R$ ${Number(value).toFixed(2)}`, 'Faturamento']}
                  cursor={{ fill: 'var(--color-gray-800)' }}
                />
                <Bar dataKey="faturamento" fill="var(--color-azul)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Cards de resumo: ícone colorido + gradiente vindo do próprio acento */}
          <div className="grid grid-cols-2 gap-3 mb-3">
            {[
              { rotulo: 'Faturamento', valor: faturamento, Icone: TrendingUp, cor: 'text-azul', grad: 'from-azul/10', href: null },
              { rotulo: 'Lucro bruto', valor: lucro, Icone: Wallet, cor: 'text-acento', grad: 'from-acento/10', href: '/financeiro' },
              { rotulo: 'Gastos', valor: gastos, Icone: TrendingDown, cor: 'text-red-400', grad: 'from-red-500/10', href: '/gastos' },
              { rotulo: 'Fiado pendente', valor: totalFiado, Icone: Clock, cor: 'text-amber-300', grad: 'from-amber-500/10', href: '/fiado' },
            ].map(({ rotulo, valor, Icone, cor, grad, href }, i) => {
              const Tag = href ? 'button' : 'div'
              return (
                <Tag
                  key={rotulo}
                  {...(href ? { onClick: () => (window.location.href = href) } : {})}
                  style={{ '--atraso': `${i * 60}ms` } as React.CSSProperties}
                  className={`anima-subir grupo text-left bg-gradient-to-br ${grad} to-transparent bg-gray-900 border border-borda rounded-2xl p-4`}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <Icone size={15} className={`${cor} grupo-icone`} />
                    <p className="text-gray-400 text-xs">{rotulo}</p>
                  </div>
                  <p className={`font-display text-xl font-bold ${cor}`}>
                    R$ {valor.toFixed(2)}
                  </p>
                </Tag>
              )
            })}
          </div>

          {/* Pedidos online do mês (delivery) */}
          {isDelivery(loja.tipo) && (
            <div
              className="bg-gray-900 border border-gray-800 rounded-2xl p-5 mb-3 cursor-pointer hover:border-acento/60 transition"
              onClick={() => window.location.href = '/pedidos'}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-xl bg-acento/15 flex items-center justify-center shrink-0">
                    <ShoppingBag size={18} className="text-acento" />
                  </div>
                  <p className="text-white font-semibold">Pedidos online</p>
                </div>
                <ChevronRight size={18} className="text-gray-500" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <p className="text-gray-500 text-xs mb-1">Pedidos no mês</p>
                  <p className="text-lg font-bold text-white">{pedidosMesQtd}</p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs mb-1">Valor total</p>
                  <p className="text-lg font-bold text-acento">R$ {pedidosMesTotal.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs mb-1">Em andamento</p>
                  <p className="text-lg font-bold text-acento">{pedidosMesAndamento}</p>
                </div>
              </div>
            </div>
          )}

          {/* Resultado líquido */}
          <div className={`rounded-2xl p-4 mb-3 ${resultadoLiquido >= 0 ? 'bg-green-950 border border-green-800' : 'bg-red-950 border border-red-800'}`}>
            <p className="text-gray-300 text-xs mb-1">Resultado líquido (lucro - gastos)</p>
            <p className={`text-2xl font-bold ${resultadoLiquido >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {resultadoLiquido >= 0 ? '+' : ''}R$ {resultadoLiquido.toFixed(2)}
            </p>
          </div>

          {/* Conquistas */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            {BADGES.map(badge => {
              const earned = conquistas.includes(badge.tipo)
              const isNew = novosBadges.includes(badge.tipo)
              return (
                <div
                  key={badge.tipo}
                  className={`rounded-2xl p-4 flex flex-col items-center gap-1.5 border transition-all ${
                    earned
                      ? `${badge.bg} ${badge.border} ${isNew ? 'badge-pop' : ''}`
                      : 'bg-gray-900 border-gray-800 opacity-40'
                  }`}
                >
                  <span className="text-2xl">{badge.emoji}</span>
                  <p className={`text-xs font-semibold text-center leading-tight ${earned ? badge.label : 'text-gray-500'}`}>
                    {badge.nome}
                  </p>
                  <p className="text-gray-600 text-xs">
                    R$ {badge.threshold.toLocaleString('pt-BR')}
                  </p>
                  {earned && (
                    <span className="text-green-400 text-xs font-medium">✓ Conquistado</span>
                  )}
                </div>
              )
            })}
          </div>

          {mpConectado && (
            <div
              className="flex items-center gap-3 bg-blue-950 border border-blue-800 rounded-2xl p-4 mb-3 cursor-pointer hover:bg-blue-900 transition"
              onClick={() => window.location.href = '/configuracoes'}
            >
              <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold text-xs flex-shrink-0">MP</div>
              <div>
                <p className="text-blue-200 font-semibold text-sm">Maquininha conectada</p>
                <p className="text-blue-400 text-xs">Pagamentos registrados automaticamente</p>
              </div>
              <span className="ml-auto w-2 h-2 rounded-full bg-green-400" />
            </div>
          )}

          {nicho.destaque !== 'estoque' && estoqueBaixo.length > 0 && (
            <div className="bg-red-950 border border-red-800 rounded-2xl p-4 mb-6">
              <p className="text-red-300 font-semibold mb-2">⚠️ Estoque baixo</p>
              {estoqueBaixo.map(p => (
                <p key={p.id} className="text-red-400 text-sm">{p.nome} — {p.quantidade} unidades</p>
              ))}
            </div>
          )}

          {(ranking.top.length > 0 || ranking.parados.length > 0) && (
            <div className="bg-gray-900 rounded-2xl p-5 mb-6">
              <div className="flex items-center gap-2 mb-4">
                <Package size={16} className="text-blue-400" />
                <h2 className="text-white font-semibold">Ranking de produtos</h2>
              </div>

              {ranking.top.length > 0 && (
                <div className="mb-1">
                  <div className="flex items-center gap-1.5 text-gray-400 text-xs mb-3">
                    <Trophy size={13} className="text-yellow-400" /> Mais vendidos {rotuloPeriodo}
                  </div>
                  <div className="flex flex-col gap-2.5">
                    {ranking.top.map((p, i) => {
                      const max = ranking.top[0].faturamento || 1
                      return (
                        <div key={p.id ?? p.nome}>
                          <div className="flex justify-between items-center text-sm mb-1 gap-2">
                            <span className="text-gray-300 truncate min-w-0">
                              <span className="text-gray-600 mr-1.5">#{i + 1}</span>{p.nome}
                            </span>
                            <span className="text-gray-400 shrink-0 text-xs">
                              {p.quantidade}x · <span className="text-green-400">{reais(p.faturamento)}</span>
                            </span>
                          </div>
                          <div className="w-full bg-gray-800 rounded-full h-1.5 overflow-hidden">
                            <div className="h-1.5 rounded-full bg-blue-500 transition-all duration-700" style={{ width: `${(p.faturamento / max) * 100}%` }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {ranking.parados.length > 0 && (
                <div className={`border-gray-800 ${ranking.top.length > 0 ? 'border-t mt-4 pt-4' : ''}`}>
                  <div className="flex items-center gap-1.5 text-gray-400 text-xs mb-2.5">
                    <Moon size={13} className="text-gray-500" /> Parados (sem vendas há 30 dias)
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {ranking.parados.map(p => (
                      <span key={p.id} className="text-xs bg-gray-800 text-gray-400 px-2.5 py-1 rounded-full">{p.nome}</span>
                    ))}
                  </div>
                  <p className="text-gray-600 text-xs mt-2.5">💡 Que tal uma promoção pra girar esse estoque?</p>
                </div>
              )}
            </div>
          )}

          {ultimasVendas.length > 0 && (
            <div className="bg-gray-900 rounded-2xl p-5">
              <h2 className="text-white font-semibold mb-4">{nicho.vocab.ultimasVendas}</h2>
              <div className="flex flex-col gap-3">
                {ultimasVendas.map(v => (
                  <div key={v.id} className="flex justify-between border-b border-gray-800 pb-3">
                    <div>
                      <p className="text-white text-sm">{v.produtos?.nome || v.descricao || '—'}</p>
                      <p className="text-gray-400 text-xs">{v.quantidade}x — {v.forma_pagamento}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-white text-sm">R$ {v.valor_total.toFixed(2)}</p>
                      <p className="text-green-400 text-xs">+R$ {v.lucro.toFixed(2)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </AppLayout>
  )
}
