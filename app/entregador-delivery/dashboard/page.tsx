'use client'
import { useState, useEffect, useMemo, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { useEntregador } from '../../hooks/useEntregador'
import { useToast } from '../../hooks/useToast'
import { Toast } from '../../components/Toast'
import { EntregadorLayout } from '../../components/EntregadorLayout'
import { MapaEntregas, type PontoMapa } from '../../components/MapaEntregas'
import { OfertaCorridaModal } from '../../components/OfertaCorridaModal'
import { STATUS_META, type PedidoCliente } from '../../lib/pedidosClientes'
import {
  STATUS_PARCERIA_META, GPS_INTERVALO_MS, META_SEMANAL_ENTREGAS, LOCALIZACAO_PING_MS,
  badgesEntregador, type ParceriaEntregador, type RankingEntregador, type OfertaCorrida,
  type FestaOfertaResumo,
} from '../../lib/entregadores'
import { tocarAlertaCorrida } from '../../lib/notificacoes'
import { uploadFotoAvaliacao, VIEW_AVAL_ENTREGADORES } from '../../lib/avaliacoes'
import { distanciaKm, formatarDistancia } from '../../lib/geo'
import { MAX_ENTREGAS_SIMULTANEAS, podemSerAgrupados, type PedidoRota } from '../../lib/rota'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { PainelGamificacao } from '../../components/PainelGamificacao'
import { CardIndicacao } from '../../components/CardIndicacao'
import Link from 'next/link'
import {
  Store, MapPin, Navigation, CircleDollarSign, Check, Handshake, PackageCheck,
  Star, History, Power, Wallet, Bike, TrendingUp,
  Award, Trophy, Target, Camera, WifiOff, RefreshCw, X, Layers,
} from 'lucide-react'

type Avaliacao = { nota: number; comentario: string | null; created_at: string }
type LojaDelivery = { id: string; nome: string; tipo?: string; localizacao?: string | null; latitude?: number | null; longitude?: number | null }
type Periodo = 'hoje' | 'semana' | 'mes' | 'tudo'

// Data local (YYYY-MM-DD) de um timestamp ISO — usa o fuso do dispositivo.
function diaLocal(iso?: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('sv-SE')
}
function hojeLocal(): string {
  return new Date().toLocaleDateString('sv-SE')
}
const reais = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`

export default function EntregadorDashboardPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-fundo flex items-center justify-center"><p className="text-gray-400">Carregando...</p></main>}>
      <EntregadorDashboard />
    </Suspense>
  )
}

function EntregadorDashboard() {
  const { entregador, loading, supabase, sair } = useEntregador()
  const { toast, mostrarToast } = useToast()
  const params = useSearchParams()

  const [lojas, setLojas] = useState<LojaDelivery[]>([])
  const [parcerias, setParcerias] = useState<ParceriaEntregador[]>([])
  const [pedidos, setPedidos] = useState<PedidoCliente[]>([])
  const [avaliacoes, setAvaliacoes] = useState<Avaliacao[]>([])
  const [ranking, setRanking] = useState<RankingEntregador[]>([])
  const [carregando, setCarregando] = useState(true)
  const [acao, setAcao] = useState<string | null>(null)
  const [codigos, setCodigos] = useState<Record<string, string>>({})
  const [gpsAtivo, setGpsAtivo] = useState(false)
  // Comprovante de entrega (foto) por pedido, antes de confirmar.
  const [comprovantes, setComprovantes] = useState<Record<string, { file: File; preview: string }>>({})
  // Conexão: 'online' | 'offline' | 'sincronizando' (Modo Offline do GPS).
  const [conexao, setConexao] = useState<'online' | 'offline' | 'sincronizando'>('online')

  // Online/Offline: agora persistido no banco (entregadores.disponivel) — é o que
  // coloca o entregador no POOL de despacho. Offline = não recebe corridas.
  const [online, setOnline] = useState(false)
  // Posição atual do entregador (browser) — centraliza o mapa e mede distâncias.
  const [minhaPos, setMinhaPos] = useState<{ lat: number; lng: number } | null>(null)

  // Oferta de corrida recebida (modelo Uber): modal com contagem de 30s.
  const [oferta, setOferta] = useState<OfertaCorrida | null>(null)
  const [ofertaPedido, setOfertaPedido] = useState<PedidoCliente | null>(null)
  // Resumo da festa quando a oferta é uma corrida de festa (pedido_id null).
  const [ofertaFesta, setOfertaFesta] = useState<FestaOfertaResumo | null>(null)
  const [respondendo, setRespondendo] = useState(false)
  const ultimoPing = useRef(0)
  // Filtro de período do histórico.
  const [periodo, setPeriodo] = useState<Periodo>('semana')

  // Stripe Connect
  const [stripeOnboarded, setStripeOnboarded] = useState(false)
  const [stripeHasAccount, setStripeHasAccount] = useState(false)
  const [pagamentoManual, setPagamentoManual] = useState(false)

  useEffect(() => { if (entregador) { carregar(); checarStripe() } }, [entregador])
  useEffect(() => { if (entregador?.pagamento_manual) setPagamentoManual(true) }, [entregador])

  // Estado online vem do banco (entregadores.disponivel).
  useEffect(() => {
    if (entregador) setOnline(!!entregador.disponivel)
  }, [entregador])

  async function toggleOnline() {
    if (!entregador) return
    const novo = !online
    setOnline(novo) // otimista
    const patch: Record<string, unknown> = { disponivel: novo }
    // Ao ficar online, já grava a posição atual (se houver) para entrar no pool.
    if (novo && minhaPos) {
      patch.latitude = minhaPos.lat
      patch.longitude = minhaPos.lng
      patch.localizacao_at = new Date().toISOString()
      ultimoPing.current = Date.now()
    }
    const { error } = await supabase.from('entregadores').update(patch).eq('id', entregador.id)
    if (error) {
      setOnline(!novo) // reverte
      mostrarToast('Não foi possível mudar seu status. Tente de novo.', 'erro')
      return
    }
    mostrarToast(
      novo
        ? (minhaPos ? 'Você está online — pronto para receber corridas.' : 'Você está online. Ative a localização para receber corridas.')
        : 'Você ficou offline — não receberá corridas.',
      novo ? 'sucesso' : 'erro',
    )
  }

  // Enquanto online, grava a posição no banco periodicamente (entra/atualiza no
  // pool de despacho). Throttle por LOCALIZACAO_PING_MS — o watchPosition dispara
  // com frequência, mas só escrevemos a cada ~15s.
  useEffect(() => {
    if (!online || !entregador || !minhaPos) return
    if (Date.now() - ultimoPing.current < LOCALIZACAO_PING_MS) return
    ultimoPing.current = Date.now()
    void supabase.from('entregadores').update({
      latitude: minhaPos.lat, longitude: minhaPos.lng, localizacao_at: new Date().toISOString(),
    }).eq('id', entregador.id)
  }, [online, minhaPos, entregador, supabase])

  // Geolocalização contínua para o mapa e o cálculo de distância até a retirada.
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return
    const id = navigator.geolocation.watchPosition(
      pos => setMinhaPos({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => { /* sem permissão: mapa fica sem o pino do entregador */ },
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 12_000 },
    )
    return () => navigator.geolocation.clearWatch(id)
  }, [])

  useEffect(() => {
    if (params.get('stripe') === 'ok') { checarStripe(); setPagamentoManual(false); mostrarToast('Conta Stripe conectada!', 'sucesso') }
    if (params.get('stripe') === 'erro') mostrarToast('Não foi possível conectar a Stripe. Tente de novo.', 'erro')
    if (params.get('stripe') === 'manual') { setPagamentoManual(true); mostrarToast('Não foi possível conectar ao Stripe agora. Combine o pagamento das corridas com o suporte.', 'erro') }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function conectarStripe() { window.location.href = '/api/entregador/stripe-connect' }

  async function carregar() {
    const [lojasRes, parceriasRes, pedidosRes, avalRes, rankingRes] = await Promise.all([
      fetch('/api/entregador/lojas-delivery')
        .then(r => (r.ok ? r.json() : { lojas: [] }))
        .catch(() => ({ lojas: [] })),
      supabase.from('entregador_parcerias').select('*').eq('entregador_id', entregador!.id),
      supabase.from('pedidos_clientes').select('*').order('created_at', { ascending: false }),
      supabase.from(VIEW_AVAL_ENTREGADORES).select('nota, comentario, created_at')
        .eq('entregador_id', entregador!.id).order('created_at', { ascending: false }),
      // Ranking semanal (view agregada; ignora silenciosamente se ainda não migrada).
      supabase.from('ranking_entregadores_semana').select('*').order('entregas', { ascending: false }),
    ])
    setLojas((lojasRes.lojas || []) as LojaDelivery[])
    setParcerias((parceriasRes.data || []) as ParceriaEntregador[])
    setPedidos((pedidosRes.data || []) as PedidoCliente[])
    setAvaliacoes((avalRes.data || []) as Avaliacao[])
    setRanking((rankingRes.data || []) as RankingEntregador[])
    setCarregando(false)
  }

  async function checarStripe() {
    try {
      const res = await fetch('/api/entregador/stripe-status')
      const d = await res.json()
      setStripeOnboarded(!!d.onboarded)
      setStripeHasAccount(!!d.hasAccount)
    } catch { /* silencioso */ }
  }

  const lojaPorId = useMemo(() => {
    const m: Record<string, LojaDelivery> = {}
    for (const l of lojas) m[l.id] = l
    return m
  }, [lojas])
  const nomeLoja = (id: string) => lojaPorId[id]?.nome || 'Loja'

  const parceriaPorLoja = useMemo(() => {
    const m: Record<string, ParceriaEntregador> = {}
    for (const p of parcerias) m[p.loja_id] = p
    return m
  }, [parcerias])

  const lojasAceitasIds = useMemo(
    () => new Set(parcerias.filter(p => p.status === 'aceita').map(p => p.loja_id)),
    [parcerias],
  )
  const temParceriaAceita = lojasAceitasIds.size > 0

  // Dentro de um lote, a ordem de coleta é a ordem em que ele deve passar nas
  // lojas — então é essa a ordem em que os cards aparecem.
  const ativas = pedidos
    .filter(p => p.entregador_id === entregador?.id && p.status !== 'entregue' && p.status !== 'cancelado')
    .sort((a, b) => (a.ordem_coleta ?? 0) - (b.ordem_coleta ?? 0))
  // Disponíveis: TODOS os pedidos ainda sem entregador, prontos para ser
  // reivindicados (status 'recebido' ou 'preparando'), de loja parceira aceita.
  // ('saiu' já teve código gerado e não deveria ficar sem entregador.)
  // Offline -> não recebe nada.
  const disponiveis = online
    ? pedidos.filter(p => !p.entregador_id && (p.status === 'recebido' || p.status === 'preparando') && lojasAceitasIds.has(p.loja_id))
    : []

  // --- Multi-entrega ---
  // Espelha o que /api/entregador/aceitar-junto valida: exatamente 1 entrega em
  // andamento, ainda fora de lote. O servidor decide de verdade; aqui só
  // decidimos se vale mostrar o botão.
  const rotaDoPedido = (p: PedidoCliente): PedidoRota => ({
    id: p.id,
    loja: lojaPorId[p.loja_id] ?? {},
    entrega: { latitude: p.entrega_latitude, longitude: p.entrega_longitude },
  })
  const rotaAtiva = ativas.length === 1 && !ativas[0].lote_entrega_id ? rotaDoPedido(ativas[0]) : null
  // Sem coordenadas (da loja ou da entrega) não há rota — podemSerAgrupados
  // devolve false e o pedido some da oferta de agrupamento.
  const agrupavel = (p: PedidoCliente) => !!rotaAtiva && podemSerAgrupados(rotaAtiva, rotaDoPedido(p))
  const emLote = ativas.filter(p => p.lote_entrega_id).length > 0
  const noLimite = ativas.length >= MAX_ENTREGAS_SIMULTANEAS

  const historico = pedidos
    .filter(p => p.entregador_id === entregador?.id && p.status === 'entregue')
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
  const entregasFeitas = historico.length
  const totalRecebido = historico.filter(p => p.pagamento_corrida === 'pago').reduce((s, p) => s + (Number(p.valor_corrida) || 0), 0)

  // Métricas de hoje.
  const hoje = hojeLocal()
  const entregasHoje = historico.filter(p => diaLocal(p.updated_at) === hoje).length
  const ganhosHoje = historico.filter(p => diaLocal(p.updated_at) === hoje).reduce((s, p) => s + (Number(p.valor_corrida) || 0), 0)

  // Avaliação média recebida.
  const mediaNota = avaliacoes.length ? avaliacoes.reduce((s, a) => s + a.nota, 0) / avaliacoes.length : 0
  const comentarios = avaliacoes.filter(a => a.comentario && a.comentario.trim())
  const cincoEstrelas = avaliacoes.filter(a => a.nota === 5).length

  // --- Gamificação ---
  // Entregas nos últimos 7 dias (meta semanal).
  const entregasSemana = useMemo(() => {
    const lim = new Date(); lim.setDate(lim.getDate() - 7)
    return historico.filter(p => new Date(p.updated_at) >= lim).length
  }, [historico])
  const metaAtingida = entregasSemana >= META_SEMANAL_ENTREGAS
  const progressoMeta = Math.min(100, Math.round((entregasSemana / META_SEMANAL_ENTREGAS) * 100))

  const badges = useMemo(
    () => badgesEntregador({ entregas: entregasFeitas, mediaNota, totalAvaliacoes: avaliacoes.length, cincoEstrelas }),
    [entregasFeitas, mediaNota, avaliacoes.length, cincoEstrelas],
  )
  const badgesConquistadas = badges.filter(b => b.conquistada).length

  // Ranking semanal: só quem tem entrega na semana; posição do entregador atual.
  const rankingOrdenado = useMemo(
    () => [...ranking].filter(r => r.entregas > 0).sort((a, b) => b.entregas - a.entregas || b.ganhos - a.ganhos),
    [ranking],
  )
  const minhaPosicao = rankingOrdenado.findIndex(r => r.entregador_id === entregador?.id)

  const lojasSemParceria = lojas.filter(l => !parceriaPorLoja[l.id])

  // Ganhos dos últimos 7 dias (gráfico).
  const graficoSemana = useMemo(() => {
    const dias: Record<string, { dia: string; ganho: number }> = {}
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i)
      const k = d.toLocaleDateString('sv-SE')
      dias[k] = { dia: d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }), ganho: 0 }
    }
    for (const p of historico) {
      const k = diaLocal(p.updated_at)
      if (dias[k]) dias[k].ganho += Number(p.valor_corrida) || 0
    }
    return Object.values(dias)
  }, [historico])

  // Histórico filtrado por período + total ganho no período.
  const historicoFiltrado = useMemo(() => {
    if (periodo === 'tudo') return historico
    const lim = new Date()
    if (periodo === 'hoje') lim.setHours(0, 0, 0, 0)
    else if (periodo === 'semana') { lim.setDate(lim.getDate() - 7); lim.setHours(0, 0, 0, 0) }
    else { lim.setDate(1); lim.setHours(0, 0, 0, 0) } // mês: desde o dia 1
    return historico.filter(p => new Date(p.updated_at) >= lim)
  }, [historico, periodo])
  const totalGanhoPeriodo = historicoFiltrado.reduce((s, p) => s + (Number(p.valor_corrida) || 0), 0)

  // Distância do entregador até a loja (retirada) de um pedido disponível.
  function distAteRetirada(p: PedidoCliente): number | null {
    const l = lojaPorId[p.loja_id]
    if (!minhaPos || !l || l.latitude == null || l.longitude == null) return null
    return distanciaKm({ latitude: minhaPos.lat, longitude: minhaPos.lng }, { latitude: l.latitude, longitude: l.longitude })
  }

  // Pontos do mapa em tempo real: entregador + lojas dos pedidos disponíveis.
  const pontosMapa = useMemo(() => {
    const pts: PontoMapa[] = []
    if (minhaPos) pts.push({ lat: minhaPos.lat, lng: minhaPos.lng, tipo: 'entregador', label: 'Você' })
    for (const p of disponiveis) {
      const l = lojaPorId[p.loja_id]
      if (l && l.latitude != null && l.longitude != null) pts.push({ lat: l.latitude, lng: l.longitude, tipo: 'loja', label: l.nome })
    }
    return pts
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minhaPos, JSON.stringify(disponiveis.map(p => p.id)), lojaPorId])

  // ---- MODO OFFLINE: fila local de posições de GPS ----
  // Quando o envio ao Supabase falha (sem conexão), a posição é guardada em
  // localStorage e sincronizada assim que a conexão volta. Só interessa a
  // ÚLTIMA posição de cada pedido (o upsert é por pedido_id).
  type GpsPonto = { pedido_id: string; entregador_id: string; latitude: number; longitude: number; updated_at: string }
  const FILA_KEY = 'commerly:entregador:gpsqueue'
  function lerFila(): GpsPonto[] {
    try { return JSON.parse(localStorage.getItem(FILA_KEY) || '[]') } catch { return [] }
  }
  function gravarFila(fila: GpsPonto[]) {
    try { localStorage.setItem(FILA_KEY, JSON.stringify(fila)) } catch { /* modo privado */ }
  }
  function enfileirar(ponto: GpsPonto) {
    // Mantém apenas a posição mais recente por pedido.
    const fila = lerFila().filter(f => f.pedido_id !== ponto.pedido_id)
    fila.push(ponto)
    gravarFila(fila)
  }
  async function sincronizarFila() {
    const fila = lerFila()
    if (fila.length === 0) return
    setConexao('sincronizando')
    const pendentes: GpsPonto[] = []
    for (const ponto of fila) {
      const { error } = await supabase.from('entregas_localizacao').upsert(ponto)
      if (error) pendentes.push(ponto)
    }
    gravarFila(pendentes)
    setConexao(pendentes.length === 0 ? 'online' : 'offline')
  }

  // Reage a reconexão/queda do navegador: ao voltar online, sincroniza a fila.
  useEffect(() => {
    if (typeof window === 'undefined') return
    setConexao(navigator.onLine ? 'online' : 'offline')
    const aoVoltar = () => { void sincronizarFila() }
    const aoCair = () => setConexao('offline')
    window.addEventListener('online', aoVoltar)
    window.addEventListener('offline', aoCair)
    return () => {
      window.removeEventListener('online', aoVoltar)
      window.removeEventListener('offline', aoCair)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entregador?.id])

  // ---- GPS em tempo real: enquanto houver entrega "saiu para entrega" ----
  const emRotaKey = ativas.filter(p => p.status === 'saiu').map(p => p.id).join(',')
  useEffect(() => {
    const emRota = ativas.filter(p => p.status === 'saiu')
    if (emRota.length === 0 || !entregador) { setGpsAtivo(false); return }
    if (typeof navigator === 'undefined' || !navigator.geolocation) return
    let parado = false
    function enviar() {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          if (parado) return
          setGpsAtivo(true)
          const { latitude, longitude } = pos.coords
          const online = navigator.onLine
          let houveFalha = false
          for (const p of emRota) {
            const ponto: GpsPonto = {
              pedido_id: p.id, entregador_id: entregador!.id,
              latitude, longitude, updated_at: new Date().toISOString(),
            }
            if (!online) { enfileirar(ponto); houveFalha = true; continue }
            const { error } = await supabase.from('entregas_localizacao').upsert(ponto)
            if (error) { enfileirar(ponto); houveFalha = true }
          }
          if (houveFalha) setConexao('offline')
          else {
            // Envio ok: se havia fila acumulada, drena agora.
            if (lerFila().length > 0) void sincronizarFila()
            else setConexao('online')
          }
        },
        (err) => { if (err.code === err.PERMISSION_DENIED) setGpsAtivo(false) },
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 9000 },
      )
    }
    enviar()
    const iv = setInterval(enviar, GPS_INTERVALO_MS)
    return () => { parado = true; clearInterval(iv) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emRotaKey, entregador?.id])

  // Mostra a oferta: busca os detalhes do pedido (RLS libera enquanto pendente)
  // e toca o alerta. Ignora ofertas já vencidas.
  async function abrirOferta(o: OfertaCorrida) {
    if (o.status !== 'pendente' || new Date(o.expira_em).getTime() <= Date.now()) return
    if (o.festa_id) {
      // Oferta de festa: os detalhes vêm da API (tabelas de festa têm RLS).
      const resumo = await fetch(`/api/entregador/festa-oferta?oferta_id=${o.id}`)
        .then(r => (r.ok ? r.json() : null)).catch(() => null)
      setOferta(o)
      setOfertaPedido(null)
      setOfertaFesta(resumo as FestaOfertaResumo | null)
    } else {
      const { data: ped } = await supabase.from('pedidos_clientes').select('*').eq('id', o.pedido_id).maybeSingle()
      setOferta(o)
      setOfertaPedido((ped as PedidoCliente) || null)
      setOfertaFesta(null)
    }
    tocarAlertaCorrida()
  }

  // Realtime: recebe a oferta de corrida em tempo real (estilo Uber).
  useEffect(() => {
    if (!entregador) return
    const canal = supabase
      .channel(`ofertas:${entregador.id}:${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'corrida_ofertas', filter: `entregador_id=eq.${entregador.id}` },
        (payload: any) => { void abrirOferta(payload.new as OfertaCorrida) },
      )
      .subscribe()
    return () => { supabase.removeChannel(canal) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entregador?.id])

  // Ao abrir o app, verifica se já existe uma oferta pendente válida (o push
  // pode ter chegado com o app fechado).
  useEffect(() => {
    if (!entregador) return
    ;(async () => {
      const { data } = await supabase
        .from('corrida_ofertas').select('*')
        .eq('entregador_id', entregador.id).eq('status', 'pendente')
        .gt('expira_em', new Date().toISOString())
        .order('created_at', { ascending: false }).limit(1)
      const o = (data || [])[0] as OfertaCorrida | undefined
      if (o) void abrirOferta(o)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entregador?.id])

  async function responderOferta(resposta: 'aceita' | 'recusada') {
    if (!oferta) return
    setRespondendo(true)
    try {
      const res = await fetch('/api/entregador/responder-corrida', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oferta_id: oferta.id, resposta }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { mostrarToast(d.error || 'Não foi possível responder à corrida.', 'erro'); setOferta(null); setOfertaPedido(null); setOfertaFesta(null); return }
      if (resposta === 'aceita') {
        mostrarToast(
          oferta.festa_id ? 'Festa aceita! Passe nas lojas e entregue tudo num endereço só.' : 'Corrida aceita! Vá até a loja retirar.',
          'sucesso',
        )
        carregar()
      }
      else mostrarToast('Corrida recusada.', 'erro')
      setOferta(null); setOfertaPedido(null); setOfertaFesta(null)
    } catch { mostrarToast('Erro de rede.', 'erro') } finally { setRespondendo(false) }
  }

  // Contagem esgotada sem resposta: fecha o modal (o servidor expira sozinho e o
  // comerciante passa a ofertar ao próximo).
  function expirarOferta() { setOferta(null); setOfertaPedido(null); setOfertaFesta(null) }

  async function solicitarParceria(lojaId: string) {
    setAcao(lojaId)
    const { error } = await supabase.from('entregador_parcerias').insert({ entregador_id: entregador!.id, loja_id: lojaId })
    setAcao(null)
    if (error) { mostrarToast('Não foi possível enviar a solicitação.', 'erro'); return }
    mostrarToast('Solicitação enviada! Aguarde a loja aceitar.', 'sucesso')
    carregar()
  }

  async function desistirCorrida(pedidoId: string) {
    setAcao(pedidoId)
    try {
      const res = await fetch('/api/entregador/desistir-corrida', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pedido_id: pedidoId }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { mostrarToast(d.error || 'Não foi possível desistir.', 'erro'); return }
      mostrarToast('Você desistiu da corrida. Ela voltou para o pool.', 'sucesso')
      carregar()
    } catch { mostrarToast('Erro de rede.', 'erro') } finally { setAcao(null) }
  }

  async function aceitarPedido(pedidoId: string) {
    setAcao(pedidoId)
    try {
      const res = await fetch('/api/entregador/aceitar-pedido', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pedido_id: pedidoId }),
      })
      const d = await res.json()
      if (!res.ok) { mostrarToast(d.error || 'Erro ao aceitar.', 'erro'); return }
      mostrarToast('Pedido aceito! Vá até a loja retirar.', 'sucesso')
      carregar()
    } catch { mostrarToast('Erro de rede.', 'erro') } finally { setAcao(null) }
  }

  // Multi-entrega: pega um 2º pedido para a mesma viagem. O servidor recalcula a
  // rota e recusa se o pedido saiu do pool nesse meio-tempo.
  async function aceitarJunto(pedidoId: string) {
    setAcao(pedidoId)
    try {
      const res = await fetch('/api/entregador/aceitar-junto', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pedido_id: pedidoId }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { mostrarToast(d.error || 'Não foi possível agrupar este pedido.', 'erro'); carregar(); return }
      mostrarToast(`Pedidos agrupados! Rota de ${formatarDistancia(d.distancia_km)} — siga a ordem dos cards.`, 'sucesso')
      carregar()
    } catch { mostrarToast('Erro de rede.', 'erro') } finally { setAcao(null) }
  }

  function selecionarComprovante(pedidoId: string, file: File | undefined) {
    if (!file) return
    if (file.size > 6 * 1024 * 1024) { mostrarToast('A foto deve ter no máximo 6 MB.', 'erro'); return }
    setComprovantes(prev => ({ ...prev, [pedidoId]: { file, preview: URL.createObjectURL(file) } }))
  }

  async function confirmarEntrega(pedidoId: string) {
    const codigo = (codigos[pedidoId] || '').trim()
    if (codigo.length !== 4) { mostrarToast('Digite o código de 4 dígitos do cliente.', 'erro'); return }
    setAcao(pedidoId)
    try {
      // Comprovante de entrega (foto): sobe antes de confirmar, se anexado.
      let comprovante_url: string | null = null
      const comp = comprovantes[pedidoId]
      if (comp) {
        const up = await uploadFotoAvaliacao(supabase, `comprovante/${entregador!.id}`, comp.file)
        if ('error' in up) { mostrarToast(up.error, 'erro'); return }
        comprovante_url = up.url
      }
      const res = await fetch('/api/entregador/confirmar-entrega', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pedido_id: pedidoId, codigo, comprovante_url }),
      })
      const d = await res.json()
      if (!res.ok) { mostrarToast(d.error || 'Código incorreto.', 'erro'); return }
      mostrarToast(d.pago ? `Entrega confirmada! R$ ${Number(d.valor).toFixed(2)} a caminho da sua conta.` : 'Entrega confirmada!', 'sucesso')
      setCodigos(prev => { const n = { ...prev }; delete n[pedidoId]; return n })
      setComprovantes(prev => { const n = { ...prev }; delete n[pedidoId]; return n })
      carregar()
    } catch { mostrarToast('Erro de rede.', 'erro') } finally { setAcao(null) }
  }

  if (loading) return (
    <main className="min-h-screen bg-fundo flex items-center justify-center"><p className="text-gray-400">Carregando...</p></main>
  )
  if (!entregador) return null

  const primeiroNome = entregador.nome.split(' ')[0]

  return (
    <EntregadorLayout entregador={entregador} sair={sair} titulo={`Olá, ${primeiroNome}`}>
      <Toast toast={toast} />

      {/* OFERTA DE CORRIDA — modal estilo Uber, 30s para aceitar/recusar */}
      {oferta && (
        <OfertaCorridaModal
          oferta={oferta}
          pedido={ofertaPedido}
          festa={ofertaFesta}
          nomeLoja={nomeLoja(oferta.loja_id)}
          respondendo={respondendo}
          onAceitar={() => responderOferta('aceita')}
          onRecusar={() => responderOferta('recusada')}
          onExpirar={expirarOferta}
        />
      )}

      {/* MODO OFFLINE — banner de conexão/sincronização do GPS */}
      {conexao !== 'online' && (
        <div className={`mb-4 flex items-center gap-2.5 rounded-2xl px-4 py-3 border text-sm font-medium ${
          conexao === 'sincronizando'
            ? 'bg-blue-500/10 border-blue-500/40 text-blue-300'
            : 'bg-amber-500/10 border-amber-500/40 text-amber-300'
        }`}>
          {conexao === 'sincronizando'
            ? <><RefreshCw size={16} className="animate-spin shrink-0" /> Conexão restabelecida — sincronizando localizações...</>
            : <><WifiOff size={16} className="shrink-0" /> Sem conexão — suas localizações estão sendo salvas e serão sincronizadas.</>}
        </div>
      )}

      {/* Kit oficial — sem kit, sem entregas */}
      {entregador.kit_comprado === false && (
        <Link href="/kit" className="block mb-4 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3">
          <p className="text-amber-200 font-semibold text-sm">🎒 Ative sua conta com o Kit Oficial</p>
          <p className="text-amber-200/70 text-xs mt-0.5">Sem o kit, você ainda não recebe corridas. Toque para ver o kit e o desconto do seu nível.</p>
        </Link>
      )}

      {/* Gamificação + indicação */}
      <div className="grid gap-4 mb-4">
        <PainelGamificacao papel="entregador" />
        <CardIndicacao />
      </div>

      {/* 1. HEADER: foto, nome, avaliação e status Online/Offline */}
      <section className="bg-card border border-borda rounded-2xl p-4 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-16 h-16 rounded-2xl bg-acento/15 overflow-hidden flex items-center justify-center shrink-0">
            {entregador.foto_url
              ? <img src={entregador.foto_url} alt="" className="w-full h-full object-cover" />
              : <Bike size={26} className="text-acento" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white font-bold text-lg truncate leading-tight">{entregador.nome}</p>
            <div className="flex items-center gap-1.5 mt-1">
              <div className="flex items-center gap-0.5">
                {[1, 2, 3, 4, 5].map(n => (
                  <Star key={n} size={14} className={n <= Math.round(mediaNota) ? 'fill-amber-300 text-amber-300' : 'text-gray-700'} />
                ))}
              </div>
              <span className="text-amber-300 text-sm font-semibold">{avaliacoes.length ? mediaNota.toFixed(1) : '—'}</span>
              <span className="text-gray-500 text-xs">({avaliacoes.length})</span>
            </div>
          </div>
        </div>

        {/* Botão principal do app do entregador: grande, com o estado óbvio. */}
        <button
          onClick={toggleOnline}
          className={`mt-4 w-full flex items-center justify-center gap-3 font-bold text-base py-4 rounded-2xl transition border ${
            online
              ? 'bg-azul hover:brightness-110 border-transparent text-white shadow-lg shadow-acento/20'
              : 'bg-elevado border-borda text-gray-300 hover:text-white hover:border-gray-700'
          }`}
        >
          <span className={`relative flex w-3 h-3 ${online ? '' : 'opacity-60'}`}>
            {online && <span className="absolute inline-flex w-full h-full rounded-full bg-white/70 animate-ping" />}
            <span className={`relative inline-flex w-3 h-3 rounded-full ${online ? 'bg-white' : 'bg-gray-500'}`} />
          </span>
          <Power size={19} />
          {online ? 'ONLINE — recebendo corridas' : 'OFFLINE — toque para ficar disponível'}
        </button>
        <p className="text-gray-500 text-[11px] text-center mt-2">
          {online
            ? 'As lojas próximas podem te chamar. Mantenha a localização ativa.'
            : 'Fique online para receber corridas das lojas próximas (não precisa de parceria).'}
        </p>
      </section>

      {/* 2. MAPA EM TEMPO REAL — no topo: é a informação que ele olha primeiro */}
      <section className="mb-4">
        <div className="relative rounded-2xl overflow-hidden border border-borda">
          <MapaEntregas pontos={pontosMapa} altura="h-72" />
          <span className={`absolute top-3 left-3 z-[500] text-[10px] font-semibold px-2.5 py-1 rounded-full backdrop-blur ${
            online ? 'bg-acento/20 text-acento border border-acento/40' : 'bg-black/40 text-gray-300 border border-white/10'
          }`}>
            {online ? '● Online' : 'Offline'}
          </span>
        </div>
        <p className="text-gray-500 text-xs mt-1.5">
          🛵 você · 🏪 lojas com pedidos disponíveis
          {!minhaPos && ' — ative a localização do navegador para aparecer no mapa.'}
        </p>
      </section>

      {/* 3. MÉTRICAS — gradiente vindo da própria cor do número */}
      <section className="grid grid-cols-2 gap-2.5 mb-4">
        {[
          { rotulo: 'Entregas hoje', valor: String(entregasHoje), Icone: PackageCheck, cor: 'text-white', grad: 'from-azul/12' },
          { rotulo: 'Ganhos hoje', valor: reais(ganhosHoje), Icone: Wallet, cor: 'text-acento', grad: 'from-acento/12' },
          { rotulo: 'Avaliação', valor: avaliacoes.length ? mediaNota.toFixed(1) : '—', Icone: Star, cor: 'text-amber-300', grad: 'from-amber-500/12' },
          { rotulo: 'Total entregas', valor: String(entregasFeitas), Icone: Navigation, cor: 'text-white', grad: 'from-purple-500/12' },
        ].map(({ rotulo, valor, Icone, cor, grad }, i) => (
          <div
            key={rotulo}
            style={{ '--atraso': `${i * 60}ms` } as React.CSSProperties}
            className={`anima-subir grupo bg-gradient-to-br ${grad} to-transparent bg-card border border-borda rounded-2xl p-3.5`}
          >
            <div className="flex items-center gap-1.5 text-gray-500 text-[11px] mb-1">
              <Icone size={13} className="grupo-icone" /> {rotulo}
            </div>
            <p className={`font-display text-2xl font-bold ${cor}`}>{valor}</p>
          </div>
        ))}
      </section>

      {/* META SEMANAL — bônus por bater a meta de entregas */}
      <section className={`rounded-2xl p-4 mb-4 border ${metaAtingida ? 'bg-green-500/10 border-green-500/40' : 'bg-card border-borda'}`}>
        <div className="flex items-center justify-between gap-2 mb-2">
          <h2 className="text-white font-semibold text-sm flex items-center gap-2">
            <Target size={16} className={metaAtingida ? 'text-green-400' : 'text-acento'} /> Meta da semana
          </h2>
          <span className={`text-xs font-bold ${metaAtingida ? 'text-green-300' : 'text-gray-300'}`}>{entregasSemana}/{META_SEMANAL_ENTREGAS} entregas</span>
        </div>
        <div className="h-2.5 w-full rounded-full bg-elevado overflow-hidden">
          <div className={`h-full rounded-full transition-all ${metaAtingida ? 'bg-green-400' : 'bg-acento'}`} style={{ width: `${progressoMeta}%` }} />
        </div>
        <p className={`text-xs mt-2 ${metaAtingida ? 'text-green-300' : 'text-gray-400'}`}>
          {metaAtingida
            ? '🎉 Meta batida! Você garantiu o bônus semanal desta semana.'
            : `Faça ${META_SEMANAL_ENTREGAS - entregasSemana} entrega${META_SEMANAL_ENTREGAS - entregasSemana > 1 ? 's' : ''} nesta semana e ganhe o bônus.`}
        </p>
      </section>

      {/* BADGES / CONQUISTAS */}
      <section className="bg-card border border-borda rounded-2xl p-4 mb-4">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h2 className="text-white font-semibold text-sm flex items-center gap-2"><Award size={16} className="text-acento" /> Conquistas</h2>
          <span className="text-gray-500 text-xs">{badgesConquistadas}/{badges.length}</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {badges.map(b => (
            <div key={b.id} title={b.descricao}
              className={`rounded-xl p-2.5 text-center border transition ${b.conquistada ? 'bg-elevado border-acento/40' : 'bg-card border-borda opacity-45 grayscale'}`}>
              <div className="text-2xl leading-none mb-1">{b.emoji}</div>
              <p className="text-white text-[11px] font-semibold leading-tight">{b.titulo}</p>
              <p className="text-gray-500 text-[10px] mt-0.5 leading-tight">{b.descricao}</p>
            </div>
          ))}
        </div>
      </section>

      {/* RANKING SEMANAL DE ENTREGADORES */}
      {rankingOrdenado.length > 0 && (
        <section className="bg-card border border-borda rounded-2xl p-4 mb-4">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h2 className="text-white font-semibold text-sm flex items-center gap-2"><Trophy size={16} className="text-amber-300" /> Ranking da semana</h2>
            {minhaPosicao >= 0 && <span className="text-amber-300 text-xs font-bold">Você: {minhaPosicao + 1}º</span>}
          </div>
          <div className="flex flex-col gap-1.5">
            {rankingOrdenado.slice(0, 5).map((r, i) => {
              const eu = r.entregador_id === entregador?.id
              const medalha = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}º`
              return (
                <div key={r.entregador_id} className={`flex items-center gap-2.5 rounded-xl px-2.5 py-2 ${eu ? 'bg-acento/15 border border-acento/40' : 'bg-superficie'}`}>
                  <span className="w-7 text-center text-sm font-bold shrink-0">{medalha}</span>
                  <div className="w-8 h-8 rounded-full bg-acento/15 overflow-hidden flex items-center justify-center shrink-0">
                    {r.foto_url ? <img src={r.foto_url} alt="" className="w-full h-full object-cover" /> : <Bike size={14} className="text-acento" />}
                  </div>
                  <p className={`flex-1 min-w-0 truncate text-sm font-medium ${eu ? 'text-white' : 'text-gray-300'}`}>{eu ? 'Você' : r.nome}</p>
                  <span className="text-acento text-sm font-bold shrink-0">{r.entregas} <span className="text-gray-500 font-normal text-xs">entregas</span></span>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Stripe Connect (recebimento das corridas) */}
      <section className={`rounded-2xl p-4 mb-4 border ${stripeOnboarded ? 'bg-green-500/10 border-green-500/40' : pagamentoManual && !stripeOnboarded ? 'bg-amber-500/10 border-amber-500/40' : 'bg-card border-borda'}`}>
        <div className="flex items-center gap-3">
          <CircleDollarSign size={20} className={stripeOnboarded ? 'text-green-400' : 'text-acento'} />
          <div className="flex-1 min-w-0">
            <p className="text-white font-semibold text-sm">Recebimento das corridas</p>
            <p className="text-gray-400 text-xs">
              {stripeOnboarded ? 'Conta pronta para receber via Stripe.'
                : pagamentoManual ? 'Pagamento manual pelo comerciante (por enquanto).'
                : 'Conecte sua conta para receber o valor das corridas.'}
            </p>
          </div>
          {!stripeOnboarded && !pagamentoManual && (
            <button onClick={conectarStripe} className="shrink-0 bg-[#635BFF] hover:bg-[#5249e0] text-white text-xs font-semibold px-3 py-2 rounded-lg transition">
              {stripeHasAccount ? 'Continuar' : 'Conectar'}
            </button>
          )}
          {stripeOnboarded && <Check size={18} className="text-green-400 shrink-0" />}
        </div>
        {!stripeOnboarded && pagamentoManual && (
          <div className="mt-3 pt-3 border-t border-amber-500/20">
            <p className="text-amber-200 text-xs">💳 Configure seus dados bancários com o suporte. Enquanto isso, o comerciante pode pagar suas corridas manualmente.</p>
            <button onClick={conectarStripe} className="mt-2 text-[#8b83ff] text-xs font-semibold hover:underline">Tentar conectar ao Stripe de novo</button>
          </div>
        )}
      </section>

      {carregando ? (
        <p className="text-gray-500 text-sm">Carregando...</p>
      ) : (
        <div className="flex flex-col gap-6">
          {/* (o mapa subiu para o topo — ver seção 2) */}

          {/* 5. ENTREGAS ATIVAS (com trajeto loja→cliente) */}
          {ativas.length > 0 && (
            <section>
              <h2 className="text-white font-semibold mb-2 flex items-center gap-2 flex-wrap">
                <Navigation size={16} className="text-acento" /> Minhas entregas ativas
                {gpsAtivo && <span className="text-[10px] font-medium text-green-400 bg-green-500/15 px-2 py-0.5 rounded-full">● GPS ao vivo</span>}
                {emLote && (
                  <span className="text-[10px] font-medium text-sky-300 bg-sky-500/15 border border-sky-500/40 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <Layers size={11} /> Rota agrupada
                  </span>
                )}
              </h2>
              {emLote && (
                <p className="text-gray-500 text-xs mb-2">
                  Você leva {ativas.length} pedidos na mesma viagem. Os cards estão na ordem de
                  coleta — siga de cima para baixo.
                </p>
              )}
              <div className="flex flex-col gap-3">
                {ativas.map(p => {
                  const meta = STATUS_META[p.status]
                  const loja = lojaPorId[p.loja_id]
                  const temTrajeto = loja?.latitude != null && loja?.longitude != null && p.entrega_latitude != null && p.entrega_longitude != null
                  const pontos: PontoMapa[] = []
                  if (minhaPos) pontos.push({ lat: minhaPos.lat, lng: minhaPos.lng, tipo: 'entregador', label: 'Você' })
                  if (loja?.latitude != null && loja?.longitude != null) pontos.push({ lat: loja.latitude, lng: loja.longitude, tipo: 'loja', label: loja.nome })
                  if (p.entrega_latitude != null && p.entrega_longitude != null) pontos.push({ lat: Number(p.entrega_latitude), lng: Number(p.entrega_longitude), tipo: 'cliente', label: p.anonimo ? 'Cliente anônimo' : (p.cliente_nome || 'Cliente') })
                  const rota: [number, number][] | undefined = temTrajeto
                    ? [[loja!.latitude as number, loja!.longitude as number], [Number(p.entrega_latitude), Number(p.entrega_longitude)]]
                    : undefined
                  // Navegação externa (Google Maps): rota loja -> cliente.
                  const destinoNav = p.entrega_latitude != null && p.entrega_longitude != null
                    ? `${Number(p.entrega_latitude)},${Number(p.entrega_longitude)}` : null
                  const origemNav = loja?.latitude != null && loja?.longitude != null
                    ? `${loja.latitude},${loja.longitude}` : null
                  const navUrl = destinoNav
                    ? `https://www.google.com/maps/dir/?api=1${origemNav ? `&origin=${origemNav}` : ''}&destination=${destinoNav}&travelmode=driving`
                    : null
                  // O entregador só pode desistir ANTES de o preparo começar.
                  const podeDesistir = p.status === 'recebido'
                  return (
                    <div key={p.id} className={`bg-card border rounded-2xl p-4 ${p.lote_entrega_id ? 'border-sky-500/40' : 'border-borda'}`}>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <p className="text-white font-semibold truncate">{nomeLoja(p.loja_id)}</p>
                        <span className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full border ${meta.classes}`}>{meta.emoji} {meta.label}</span>
                      </div>

                      {/* Posição deste pedido na rota agrupada. */}
                      {p.lote_entrega_id && p.ordem_coleta && p.ordem_entrega && (
                        <div className="flex items-center gap-1.5 flex-wrap mb-2">
                          <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-sky-500/10 border border-sky-500/30 text-sky-300 flex items-center gap-1">
                            <Store size={11} /> {p.ordem_coleta}ª coleta
                          </span>
                          <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-sky-500/10 border border-sky-500/30 text-sky-300 flex items-center gap-1">
                            <MapPin size={11} /> {p.ordem_entrega}ª entrega
                          </span>
                        </div>
                      )}

                      {pontos.length >= 2 && (
                        <div className="mb-3"><MapaEntregas pontos={pontos} rota={rota} altura="h-44" /></div>
                      )}

                      <p className="text-gray-400 text-xs flex items-start gap-1.5 mb-1"><MapPin size={13} className="shrink-0 mt-0.5" />{p.endereco_entrega}</p>
                      {p.cliente_telefone && (
                        <a href={`https://wa.me/55${p.cliente_telefone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="text-green-400 text-xs hover:text-green-300">{p.cliente_telefone}</a>
                      )}
                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-borda">
                        <span className="text-gray-500 text-xs">Corrida</span>
                        <span className="text-acento font-bold text-sm">{Number(p.valor_corrida) > 0 ? reais(Number(p.valor_corrida)) : 'A definir'}</span>
                      </div>

                      {/* Navegar — abre a rota loja -> cliente no Google Maps/Waze */}
                      {navUrl && (
                        <a href={navUrl} target="_blank" rel="noopener noreferrer"
                          className="mt-3 w-full flex items-center justify-center gap-1.5 bg-elevado border border-borda hover:border-acento/60 text-white font-semibold py-2.5 rounded-xl transition text-sm">
                          <Navigation size={16} className="text-acento" /> Navegar (Google Maps)
                        </a>
                      )}

                      {p.status === 'saiu' ? (
                        <div className="mt-3">
                          {/* Comprovante de entrega (foto opcional) */}
                          <div className="flex items-center gap-3 mb-2.5">
                            {comprovantes[p.id]?.preview && (
                              <img src={comprovantes[p.id].preview} alt="Comprovante" className="w-12 h-12 rounded-lg object-cover border border-borda" />
                            )}
                            <label className="inline-flex items-center gap-1.5 cursor-pointer bg-superficie border border-borda hover:border-acento/60 text-gray-300 text-xs font-medium px-3 py-2 rounded-xl transition">
                              <Camera size={14} className="text-acento" />
                              {comprovantes[p.id] ? 'Trocar comprovante' : 'Foto do comprovante'}
                              <input type="file" accept="image/*" capture="environment" className="hidden"
                                onChange={e => selecionarComprovante(p.id, e.target.files?.[0])} />
                            </label>
                          </div>
                          <p className="text-gray-400 text-xs mb-1.5">Digite o código de 4 dígitos do cliente para confirmar:</p>
                          <div className="flex gap-2">
                            <input
                              value={codigos[p.id] || ''}
                              onChange={e => setCodigos(prev => ({ ...prev, [p.id]: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
                              inputMode="numeric" maxLength={4} placeholder="0000"
                              className="w-24 bg-superficie border border-borda text-white rounded-xl px-3 py-2.5 text-center text-lg tracking-widest outline-none focus:border-acento/60"
                            />
                            <button onClick={() => confirmarEntrega(p.id)} disabled={acao === p.id}
                              className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-semibold rounded-xl transition flex items-center justify-center gap-1.5 text-sm">
                              <PackageCheck size={16} /> {acao === p.id ? 'Confirmando...' : 'Confirmar entrega'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-3">
                          <p className="text-gray-500 text-xs">Aguardando a loja liberar para entrega. Ao sair para entrega, o GPS liga e o código é gerado.</p>
                          {podeDesistir ? (
                            <button onClick={() => desistirCorrida(p.id)} disabled={acao === p.id}
                              className="mt-2 w-full flex items-center justify-center gap-1.5 bg-elevado border border-borda hover:bg-red-500/15 hover:border-red-500/40 text-gray-300 hover:text-red-400 text-xs font-medium py-2 rounded-xl transition disabled:opacity-50">
                              <X size={14} /> {acao === p.id ? '...' : 'Desistir da corrida'}
                            </button>
                          ) : (
                            <p className="text-gray-600 text-[11px] mt-2">🔒 Pedido em preparo — não é possível desistir agora.</p>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {/* 4. PEDIDOS DISPONÍVEIS */}
          <section>
            <h2 className="text-white font-semibold mb-2 flex items-center gap-2"><PackageCheck size={16} className="text-acento" /> Pedidos disponíveis</h2>
            {!online ? (
              <div className="bg-card border border-borda rounded-2xl p-5 text-center">
                <Power size={22} className="text-gray-600 mx-auto mb-2" />
                <p className="text-gray-400 text-sm">Você está <strong>offline</strong>. Fique online para receber pedidos.</p>
              </div>
            ) : !temParceriaAceita ? (
              <p className="text-gray-500 text-sm">Estando <strong className="text-gray-300">online</strong>, as lojas próximas te chamam automaticamente por aqui — sem precisar de parceria. Você também pode virar parceiro de uma loja abaixo para ver os pedidos dela nesta lista.</p>
            ) : disponiveis.length === 0 ? (
              <p className="text-gray-500 text-sm">Nenhum pedido disponível nas suas lojas parceiras agora.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {disponiveis.map(p => {
                  const meta = STATUS_META[p.status]
                  const distRet = distAteRetirada(p)
                  return (
                    <div key={p.id} className="bg-card border border-borda rounded-2xl p-4">
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <p className="text-white font-semibold truncate">{nomeLoja(p.loja_id)}</p>
                        <span className="text-acento font-bold text-sm shrink-0">{Number(p.valor_corrida) > 0 ? reais(Number(p.valor_corrida)) : 'A definir'}</span>
                      </div>
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${meta.classes}`}>{meta.emoji} {meta.label}</span>
                        {distRet != null && (
                          <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-elevado border border-borda text-gray-300 flex items-center gap-1">
                            <Store size={11} /> {formatarDistancia(distRet)} até a retirada
                          </span>
                        )}
                        {p.distancia_km != null && (
                          <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-elevado border border-borda text-gray-300 flex items-center gap-1">
                            <MapPin size={11} /> {formatarDistancia(Number(p.distancia_km))} de entrega
                          </span>
                        )}
                      </div>
                      <p className="text-gray-400 text-xs flex items-start gap-1.5"><MapPin size={13} className="shrink-0 mt-0.5" />{p.endereco_entrega}</p>

                      {noLimite ? (
                        <p className="mt-3 text-gray-500 text-xs text-center bg-superficie border border-borda rounded-xl py-2.5">
                          🔒 Você já está com {MAX_ENTREGAS_SIMULTANEAS} entregas. Conclua uma para aceitar outra.
                        </p>
                      ) : (
                        <div className="mt-3 flex flex-col gap-2">
                          {/* Mesma rota da entrega em andamento: leva os dois de uma vez. */}
                          {agrupavel(p) && (
                            <button onClick={() => aceitarJunto(p.id)} disabled={acao === p.id}
                              className="w-full flex items-center justify-center gap-1.5 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl transition text-sm">
                              <Layers size={16} /> {acao === p.id ? 'Agrupando...' : 'Aceitar junto — mesma rota'}
                            </button>
                          )}
                          <button onClick={() => aceitarPedido(p.id)} disabled={acao === p.id}
                            className={`w-full font-semibold py-2.5 rounded-xl transition text-sm disabled:opacity-50 ${
                              agrupavel(p)
                                ? 'bg-elevado border border-borda hover:border-acento/60 text-gray-300'
                                : 'bg-azul hover:brightness-110 text-white'
                            }`}>
                            {acao === p.id ? 'Aceitando...' : agrupavel(p) ? 'Aceitar separado' : 'Aceitar pedido'}
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          {/* 7. GANHOS — gráfico semanal */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-white font-semibold flex items-center gap-2"><TrendingUp size={16} className="text-acento" /> Ganhos na semana</h2>
              {totalRecebido > 0 && <span className="text-acento font-bold text-sm">{reais(totalRecebido)} recebido</span>}
            </div>
            <div className="bg-card border border-borda rounded-2xl p-4">
              <ResponsiveContainer width="100%" height={170}>
                <BarChart data={graficoSemana} margin={{ top: 4, right: 4, left: -22, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#232A32" vertical={false} />
                  <XAxis dataKey="dia" tick={{ fill: '#9ca3af', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `R$${v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v}`} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#12161B', border: '1px solid #232A32', borderRadius: 8 }}
                    labelStyle={{ color: '#e5e7eb', fontSize: 12 }}
                    formatter={(value) => [reais(Number(value)), 'Ganho']}
                    cursor={{ fill: '#1B2129' }}
                  />
                  <Bar dataKey="ganho" fill="#6FD98F" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* 6. HISTÓRICO com filtro por período */}
          <section>
            <div className="flex items-center justify-between mb-2 gap-2">
              <h2 className="text-white font-semibold flex items-center gap-2"><History size={16} className="text-acento" /> Histórico</h2>
              <span className="text-acento font-bold text-sm">{reais(totalGanhoPeriodo)}</span>
            </div>
            <div className="flex gap-1.5 mb-3">
              {([['hoje', 'Hoje'], ['semana', 'Semana'], ['mes', 'Mês'], ['tudo', 'Tudo']] as [Periodo, string][]).map(([val, label]) => (
                <button key={val} onClick={() => setPeriodo(val)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${periodo === val ? 'bg-acento text-white' : 'bg-elevado text-gray-400 hover:text-white'}`}>
                  {label}
                </button>
              ))}
            </div>
            {historicoFiltrado.length === 0 ? (
              <p className="text-gray-500 text-sm">Nenhuma entrega no período.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {historicoFiltrado.map(p => (
                  <div key={p.id} className="bg-card border border-borda rounded-2xl p-4 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-white font-semibold text-sm truncate">{nomeLoja(p.loja_id)}</p>
                      <p className="text-gray-500 text-xs">{new Date(p.updated_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-acento font-bold text-sm">{Number(p.valor_corrida) > 0 ? reais(Number(p.valor_corrida)) : '—'}</p>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${p.pagamento_corrida === 'pago' ? 'bg-green-500/15 text-green-300 border-green-500/40' : 'bg-amber-500/15 text-amber-300 border-amber-500/40'}`}>
                        {p.pagamento_corrida === 'pago' ? 'Pago' : 'Pendente'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Minhas parcerias */}
          <section>
            <h2 className="text-white font-semibold mb-2 flex items-center gap-2"><Handshake size={16} className="text-acento" /> Minhas parcerias</h2>
            {parcerias.length === 0 ? (
              <p className="text-gray-500 text-sm mb-2">Você ainda não tem parcerias. Solicite parceria a uma loja de delivery abaixo para começar a receber pedidos.</p>
            ) : (
              <div className="flex flex-col gap-2 mb-3">
                {parcerias.map(parceria => {
                  const meta = STATUS_PARCERIA_META[parceria.status]
                  return (
                    <div key={parceria.id} className="bg-card border border-borda rounded-2xl p-4 flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-acento/15 flex items-center justify-center shrink-0"><Store size={16} className="text-acento" /></div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-semibold text-sm truncate">{nomeLoja(parceria.loja_id)}</p>
                        <p className="text-gray-500 text-xs">
                          {parceria.status === 'pendente' && 'Aguardando a loja aceitar'}
                          {parceria.status === 'aceita' && 'Você recebe os pedidos desta loja'}
                          {parceria.status === 'recusada' && 'A loja recusou a parceria'}
                        </p>
                      </div>
                      <span className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full border ${meta.classes}`}>{meta.label}</span>
                    </div>
                  )
                })}
              </div>
            )}
            {lojasSemParceria.length > 0 && (
              <>
                <p className="text-gray-400 text-xs font-semibold mb-2 mt-1">Solicitar nova parceria</p>
                <div className="flex flex-col gap-2">
                  {lojasSemParceria.map(l => (
                    <div key={l.id} className="bg-card border border-borda rounded-2xl p-4 flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-elevado flex items-center justify-center shrink-0"><Store size={16} className="text-gray-400" /></div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-semibold text-sm truncate">{l.nome}</p>
                        {l.localizacao && <p className="text-gray-500 text-xs truncate">{l.localizacao}</p>}
                      </div>
                      <button onClick={() => solicitarParceria(l.id)} disabled={acao === l.id}
                        className="shrink-0 bg-elevado border border-borda hover:border-acento/60 text-white text-xs font-semibold px-3 py-2 rounded-lg transition disabled:opacity-50">
                        {acao === l.id ? '...' : 'Solicitar'}
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>

          {/* Avaliações recebidas */}
          <section>
            <h2 className="text-white font-semibold mb-2 flex items-center gap-2"><Star size={16} className="text-acento" /> Avaliação dos clientes</h2>
            {avaliacoes.length === 0 ? (
              <p className="text-gray-500 text-sm">Você ainda não recebeu avaliações.</p>
            ) : (
              <div className="bg-card border border-borda rounded-2xl p-4">
                <div className="flex items-center gap-3 mb-1">
                  <span className="text-2xl font-bold text-amber-300">{mediaNota.toFixed(1)}</span>
                  <div className="flex items-center gap-0.5">
                    {[1, 2, 3, 4, 5].map(n => (
                      <Star key={n} size={16} className={n <= Math.round(mediaNota) ? 'fill-amber-300 text-amber-300' : 'text-gray-600'} />
                    ))}
                  </div>
                  <span className="text-gray-500 text-xs ml-auto">{avaliacoes.length} avaliação{avaliacoes.length > 1 ? 'ões' : ''}</span>
                </div>
                {comentarios.length > 0 && (
                  <div className="flex flex-col gap-2 mt-3 pt-3 border-t border-borda">
                    {comentarios.slice(0, 5).map((a, i) => (
                      <div key={i}>
                        <div className="flex items-center gap-1 mb-0.5">
                          {[1, 2, 3, 4, 5].map(n => (
                            <Star key={n} size={11} className={n <= a.nota ? 'fill-amber-300 text-amber-300' : 'text-gray-700'} />
                          ))}
                        </div>
                        <p className="text-gray-300 text-xs">{a.comentario}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      )}
    </EntregadorLayout>
  )
}
