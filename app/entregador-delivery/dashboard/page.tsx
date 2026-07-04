'use client'
import { useState, useEffect, useMemo, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { useEntregador } from '../../hooks/useEntregador'
import { useToast } from '../../hooks/useToast'
import { Toast } from '../../components/Toast'
import { EntregadorLayout } from '../../components/EntregadorLayout'
import { MapaEntregas, type PontoMapa } from '../../components/MapaEntregas'
import { STATUS_META, type PedidoCliente } from '../../lib/pedidosClientes'
import { STATUS_PARCERIA_META, GPS_INTERVALO_MS, type ParceriaEntregador } from '../../lib/entregadores'
import { distanciaKm, formatarDistancia } from '../../lib/geo'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import {
  Store, MapPin, Navigation, CircleDollarSign, Check, Handshake, PackageCheck,
  Star, History, Power, Wallet, Bike, MapPinned, TrendingUp,
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
    <Suspense fallback={<main className="min-h-screen bg-[#0a0f1a] flex items-center justify-center"><p className="text-gray-400">Carregando...</p></main>}>
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
  const [carregando, setCarregando] = useState(true)
  const [acao, setAcao] = useState<string | null>(null)
  const [codigos, setCodigos] = useState<Record<string, string>>({})
  const [gpsAtivo, setGpsAtivo] = useState(false)

  // Online/Offline: offline não recebe novos pedidos. Persistido em localStorage
  // (por entregador) — é um estado de sessão/dispositivo, sem coluna no banco.
  const [online, setOnline] = useState(true)
  // Posição atual do entregador (browser) — centraliza o mapa e mede distâncias.
  const [minhaPos, setMinhaPos] = useState<{ lat: number; lng: number } | null>(null)
  // Filtro de período do histórico.
  const [periodo, setPeriodo] = useState<Periodo>('semana')

  // Stripe Connect
  const [stripeOnboarded, setStripeOnboarded] = useState(false)
  const [stripeHasAccount, setStripeHasAccount] = useState(false)
  const [pagamentoManual, setPagamentoManual] = useState(false)

  useEffect(() => { if (entregador) { carregar(); checarStripe() } }, [entregador])
  useEffect(() => { if (entregador?.pagamento_manual) setPagamentoManual(true) }, [entregador])

  // Carrega o estado online salvo (padrão: online).
  useEffect(() => {
    if (!entregador) return
    try {
      const v = localStorage.getItem(`commerly:entregador:online:${entregador.id}`)
      if (v != null) setOnline(v === '1')
    } catch { /* modo privado */ }
  }, [entregador])

  function toggleOnline() {
    setOnline(prev => {
      const novo = !prev
      try { localStorage.setItem(`commerly:entregador:online:${entregador!.id}`, novo ? '1' : '0') } catch {}
      mostrarToast(novo ? 'Você está online — recebendo pedidos.' : 'Você ficou offline — não receberá novos pedidos.', novo ? 'sucesso' : 'erro')
      return novo
    })
  }

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
    const [lojasRes, parceriasRes, pedidosRes, avalRes] = await Promise.all([
      fetch('/api/entregador/lojas-delivery')
        .then(r => (r.ok ? r.json() : { lojas: [] }))
        .catch(() => ({ lojas: [] })),
      supabase.from('entregador_parcerias').select('*').eq('entregador_id', entregador!.id),
      supabase.from('pedidos_clientes').select('*').order('created_at', { ascending: false }),
      supabase.from('avaliacoes_entregadores').select('nota, comentario, created_at')
        .eq('entregador_id', entregador!.id).order('created_at', { ascending: false }),
    ])
    setLojas((lojasRes.lojas || []) as LojaDelivery[])
    setParcerias((parceriasRes.data || []) as ParceriaEntregador[])
    setPedidos((pedidosRes.data || []) as PedidoCliente[])
    setAvaliacoes((avalRes.data || []) as Avaliacao[])
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

  const ativas = pedidos.filter(p => p.entregador_id === entregador?.id && p.status !== 'entregue' && p.status !== 'cancelado')
  // Disponíveis: sem entregador, prontos p/ rota e de loja parceira aceita.
  // Offline -> não recebe nada.
  const disponiveis = online
    ? pedidos.filter(p => !p.entregador_id && (p.status === 'preparando' || p.status === 'saiu') && lojasAceitasIds.has(p.loja_id))
    : []

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
          for (const p of emRota) {
            await supabase.from('entregas_localizacao').upsert({
              pedido_id: p.id, entregador_id: entregador!.id,
              latitude, longitude, updated_at: new Date().toISOString(),
            })
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

  async function solicitarParceria(lojaId: string) {
    setAcao(lojaId)
    const { error } = await supabase.from('entregador_parcerias').insert({ entregador_id: entregador!.id, loja_id: lojaId })
    setAcao(null)
    if (error) { mostrarToast('Não foi possível enviar a solicitação.', 'erro'); return }
    mostrarToast('Solicitação enviada! Aguarde a loja aceitar.', 'sucesso')
    carregar()
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

  async function confirmarEntrega(pedidoId: string) {
    const codigo = (codigos[pedidoId] || '').trim()
    if (codigo.length !== 4) { mostrarToast('Digite o código de 4 dígitos do cliente.', 'erro'); return }
    setAcao(pedidoId)
    try {
      const res = await fetch('/api/entregador/confirmar-entrega', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pedido_id: pedidoId, codigo }),
      })
      const d = await res.json()
      if (!res.ok) { mostrarToast(d.error || 'Código incorreto.', 'erro'); return }
      mostrarToast(d.pago ? `Entrega confirmada! R$ ${Number(d.valor).toFixed(2)} a caminho da sua conta.` : 'Entrega confirmada!', 'sucesso')
      setCodigos(prev => { const n = { ...prev }; delete n[pedidoId]; return n })
      carregar()
    } catch { mostrarToast('Erro de rede.', 'erro') } finally { setAcao(null) }
  }

  if (loading) return (
    <main className="min-h-screen bg-[#0a0f1a] flex items-center justify-center"><p className="text-gray-400">Carregando...</p></main>
  )
  if (!entregador) return null

  const primeiroNome = entregador.nome.split(' ')[0]

  return (
    <EntregadorLayout entregador={entregador} sair={sair} titulo={`Olá, ${primeiroNome}`}>
      <Toast toast={toast} />

      {/* 1. HEADER: foto, nome, avaliação e status Online/Offline */}
      <section className="bg-[#12161B] border border-[#232A32] rounded-2xl p-4 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-16 h-16 rounded-2xl bg-[#C1441E]/15 overflow-hidden flex items-center justify-center shrink-0">
            {entregador.foto_url
              ? <img src={entregador.foto_url} alt="" className="w-full h-full object-cover" />
              : <Bike size={26} className="text-[#E0632C]" />}
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

        <button
          onClick={toggleOnline}
          className={`mt-4 w-full flex items-center justify-center gap-2 font-semibold py-2.5 rounded-xl transition border ${
            online
              ? 'bg-green-500/15 border-green-500/40 text-green-300 hover:bg-green-500/25'
              : 'bg-[#1B2129] border-[#232A32] text-gray-400 hover:text-white'
          }`}
        >
          <span className={`w-2.5 h-2.5 rounded-full ${online ? 'bg-green-400' : 'bg-gray-500'}`} />
          <Power size={16} />
          {online ? 'Online — recebendo pedidos' : 'Offline — toque para ficar online'}
        </button>
      </section>

      {/* 2. MÉTRICAS */}
      <section className="grid grid-cols-2 gap-2.5 mb-4">
        <div className="bg-[#12161B] border border-[#232A32] rounded-2xl p-3.5">
          <div className="flex items-center gap-1.5 text-gray-500 text-[11px] mb-1"><PackageCheck size={13} /> Entregas hoje</div>
          <p className="text-2xl font-bold text-white">{entregasHoje}</p>
        </div>
        <div className="bg-[#12161B] border border-[#232A32] rounded-2xl p-3.5">
          <div className="flex items-center gap-1.5 text-gray-500 text-[11px] mb-1"><Wallet size={13} /> Ganhos hoje</div>
          <p className="text-2xl font-bold text-[#6FD98F]">{reais(ganhosHoje)}</p>
        </div>
        <div className="bg-[#12161B] border border-[#232A32] rounded-2xl p-3.5">
          <div className="flex items-center gap-1.5 text-gray-500 text-[11px] mb-1"><Star size={13} /> Avaliação</div>
          <p className="text-2xl font-bold text-amber-300">{avaliacoes.length ? mediaNota.toFixed(1) : '—'}</p>
        </div>
        <div className="bg-[#12161B] border border-[#232A32] rounded-2xl p-3.5">
          <div className="flex items-center gap-1.5 text-gray-500 text-[11px] mb-1"><Navigation size={13} /> Total entregas</div>
          <p className="text-2xl font-bold text-white">{entregasFeitas}</p>
        </div>
      </section>

      {/* Stripe Connect (recebimento das corridas) */}
      <section className={`rounded-2xl p-4 mb-4 border ${stripeOnboarded ? 'bg-green-500/10 border-green-500/40' : pagamentoManual && !stripeOnboarded ? 'bg-amber-500/10 border-amber-500/40' : 'bg-[#12161B] border-[#232A32]'}`}>
        <div className="flex items-center gap-3">
          <CircleDollarSign size={20} className={stripeOnboarded ? 'text-green-400' : 'text-[#E0632C]'} />
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
          {/* 3. MAPA EM TEMPO REAL */}
          <section>
            <h2 className="text-white font-semibold mb-2 flex items-center gap-2">
              <MapPinned size={16} className="text-[#E0632C]" /> Mapa em tempo real
              {online
                ? <span className="text-[10px] font-medium text-green-400 bg-green-500/15 px-2 py-0.5 rounded-full">● Online</span>
                : <span className="text-[10px] font-medium text-gray-400 bg-gray-500/15 px-2 py-0.5 rounded-full">Offline</span>}
            </h2>
            <MapaEntregas pontos={pontosMapa} altura="h-64" />
            <p className="text-gray-500 text-xs mt-1.5">
              🛵 você · 🏪 lojas com pedidos disponíveis
              {!minhaPos && ' — ative a localização do navegador para aparecer no mapa.'}
            </p>
          </section>

          {/* 5. ENTREGAS ATIVAS (com trajeto loja→cliente) */}
          {ativas.length > 0 && (
            <section>
              <h2 className="text-white font-semibold mb-2 flex items-center gap-2">
                <Navigation size={16} className="text-[#E0632C]" /> Minhas entregas ativas
                {gpsAtivo && <span className="text-[10px] font-medium text-green-400 bg-green-500/15 px-2 py-0.5 rounded-full">● GPS ao vivo</span>}
              </h2>
              <div className="flex flex-col gap-3">
                {ativas.map(p => {
                  const meta = STATUS_META[p.status]
                  const loja = lojaPorId[p.loja_id]
                  const temTrajeto = loja?.latitude != null && loja?.longitude != null && p.entrega_latitude != null && p.entrega_longitude != null
                  const pontos: PontoMapa[] = []
                  if (minhaPos) pontos.push({ lat: minhaPos.lat, lng: minhaPos.lng, tipo: 'entregador', label: 'Você' })
                  if (loja?.latitude != null && loja?.longitude != null) pontos.push({ lat: loja.latitude, lng: loja.longitude, tipo: 'loja', label: loja.nome })
                  if (p.entrega_latitude != null && p.entrega_longitude != null) pontos.push({ lat: Number(p.entrega_latitude), lng: Number(p.entrega_longitude), tipo: 'cliente', label: p.cliente_nome || 'Cliente' })
                  const rota: [number, number][] | undefined = temTrajeto
                    ? [[loja!.latitude as number, loja!.longitude as number], [Number(p.entrega_latitude), Number(p.entrega_longitude)]]
                    : undefined
                  return (
                    <div key={p.id} className="bg-[#12161B] border border-[#232A32] rounded-2xl p-4">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <p className="text-white font-semibold truncate">{nomeLoja(p.loja_id)}</p>
                        <span className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full border ${meta.classes}`}>{meta.emoji} {meta.label}</span>
                      </div>

                      {pontos.length >= 2 && (
                        <div className="mb-3"><MapaEntregas pontos={pontos} rota={rota} altura="h-44" /></div>
                      )}

                      <p className="text-gray-400 text-xs flex items-start gap-1.5 mb-1"><MapPin size={13} className="shrink-0 mt-0.5" />{p.endereco_entrega}</p>
                      {p.cliente_telefone && (
                        <a href={`https://wa.me/55${p.cliente_telefone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="text-green-400 text-xs hover:text-green-300">{p.cliente_telefone}</a>
                      )}
                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-[#232A32]">
                        <span className="text-gray-500 text-xs">Corrida</span>
                        <span className="text-[#6FD98F] font-bold text-sm">{Number(p.valor_corrida) > 0 ? reais(Number(p.valor_corrida)) : 'A definir'}</span>
                      </div>

                      {p.status === 'saiu' ? (
                        <div className="mt-3">
                          <p className="text-gray-400 text-xs mb-1.5">Digite o código de 4 dígitos do cliente para confirmar:</p>
                          <div className="flex gap-2">
                            <input
                              value={codigos[p.id] || ''}
                              onChange={e => setCodigos(prev => ({ ...prev, [p.id]: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
                              inputMode="numeric" maxLength={4} placeholder="0000"
                              className="w-24 bg-[#171C22] border border-[#232A32] text-white rounded-xl px-3 py-2.5 text-center text-lg tracking-widest outline-none focus:border-[#C1441E]/60"
                            />
                            <button onClick={() => confirmarEntrega(p.id)} disabled={acao === p.id}
                              className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-semibold rounded-xl transition flex items-center justify-center gap-1.5 text-sm">
                              <PackageCheck size={16} /> {acao === p.id ? 'Confirmando...' : 'Confirmar entrega'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-gray-500 text-xs mt-3">Aguardando a loja liberar para entrega. Ao sair para entrega, o GPS liga e o código é gerado.</p>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {/* 4. PEDIDOS DISPONÍVEIS */}
          <section>
            <h2 className="text-white font-semibold mb-2 flex items-center gap-2"><PackageCheck size={16} className="text-[#E0632C]" /> Pedidos disponíveis</h2>
            {!online ? (
              <div className="bg-[#12161B] border border-[#232A32] rounded-2xl p-5 text-center">
                <Power size={22} className="text-gray-600 mx-auto mb-2" />
                <p className="text-gray-400 text-sm">Você está <strong>offline</strong>. Fique online para receber pedidos.</p>
              </div>
            ) : !temParceriaAceita ? (
              <p className="text-gray-500 text-sm">Você ainda não tem parceria aceita. Solicite parceria a uma loja abaixo para receber pedidos.</p>
            ) : disponiveis.length === 0 ? (
              <p className="text-gray-500 text-sm">Nenhum pedido disponível nas suas lojas parceiras agora.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {disponiveis.map(p => {
                  const meta = STATUS_META[p.status]
                  const distRet = distAteRetirada(p)
                  return (
                    <div key={p.id} className="bg-[#12161B] border border-[#232A32] rounded-2xl p-4">
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <p className="text-white font-semibold truncate">{nomeLoja(p.loja_id)}</p>
                        <span className="text-[#6FD98F] font-bold text-sm shrink-0">{Number(p.valor_corrida) > 0 ? reais(Number(p.valor_corrida)) : 'A definir'}</span>
                      </div>
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${meta.classes}`}>{meta.emoji} {meta.label}</span>
                        {distRet != null && (
                          <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-[#1B2129] border border-[#232A32] text-gray-300 flex items-center gap-1">
                            <Store size={11} /> {formatarDistancia(distRet)} até a retirada
                          </span>
                        )}
                        {p.distancia_km != null && (
                          <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-[#1B2129] border border-[#232A32] text-gray-300 flex items-center gap-1">
                            <MapPin size={11} /> {formatarDistancia(Number(p.distancia_km))} de entrega
                          </span>
                        )}
                      </div>
                      <p className="text-gray-400 text-xs flex items-start gap-1.5"><MapPin size={13} className="shrink-0 mt-0.5" />{p.endereco_entrega}</p>
                      <button onClick={() => aceitarPedido(p.id)} disabled={acao === p.id}
                        className="mt-3 w-full bg-[#C1441E] hover:bg-[#a83a19] disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl transition text-sm">
                        {acao === p.id ? 'Aceitando...' : 'Aceitar pedido'}
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          {/* 7. GANHOS — gráfico semanal */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-white font-semibold flex items-center gap-2"><TrendingUp size={16} className="text-[#6FD98F]" /> Ganhos na semana</h2>
              {totalRecebido > 0 && <span className="text-[#6FD98F] font-bold text-sm">{reais(totalRecebido)} recebido</span>}
            </div>
            <div className="bg-[#12161B] border border-[#232A32] rounded-2xl p-4">
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
              <h2 className="text-white font-semibold flex items-center gap-2"><History size={16} className="text-[#E0632C]" /> Histórico</h2>
              <span className="text-[#6FD98F] font-bold text-sm">{reais(totalGanhoPeriodo)}</span>
            </div>
            <div className="flex gap-1.5 mb-3">
              {([['hoje', 'Hoje'], ['semana', 'Semana'], ['mes', 'Mês'], ['tudo', 'Tudo']] as [Periodo, string][]).map(([val, label]) => (
                <button key={val} onClick={() => setPeriodo(val)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${periodo === val ? 'bg-[#C1441E] text-white' : 'bg-[#1B2129] text-gray-400 hover:text-white'}`}>
                  {label}
                </button>
              ))}
            </div>
            {historicoFiltrado.length === 0 ? (
              <p className="text-gray-500 text-sm">Nenhuma entrega no período.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {historicoFiltrado.map(p => (
                  <div key={p.id} className="bg-[#12161B] border border-[#232A32] rounded-2xl p-4 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-white font-semibold text-sm truncate">{nomeLoja(p.loja_id)}</p>
                      <p className="text-gray-500 text-xs">{new Date(p.updated_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[#6FD98F] font-bold text-sm">{Number(p.valor_corrida) > 0 ? reais(Number(p.valor_corrida)) : '—'}</p>
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
            <h2 className="text-white font-semibold mb-2 flex items-center gap-2"><Handshake size={16} className="text-[#E0632C]" /> Minhas parcerias</h2>
            {parcerias.length === 0 ? (
              <p className="text-gray-500 text-sm mb-2">Você ainda não tem parcerias. Solicite parceria a uma loja de delivery abaixo para começar a receber pedidos.</p>
            ) : (
              <div className="flex flex-col gap-2 mb-3">
                {parcerias.map(parceria => {
                  const meta = STATUS_PARCERIA_META[parceria.status]
                  return (
                    <div key={parceria.id} className="bg-[#12161B] border border-[#232A32] rounded-2xl p-4 flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-[#C1441E]/15 flex items-center justify-center shrink-0"><Store size={16} className="text-[#E0632C]" /></div>
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
                    <div key={l.id} className="bg-[#12161B] border border-[#232A32] rounded-2xl p-4 flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-[#1B2129] flex items-center justify-center shrink-0"><Store size={16} className="text-gray-400" /></div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-semibold text-sm truncate">{l.nome}</p>
                        {l.localizacao && <p className="text-gray-500 text-xs truncate">{l.localizacao}</p>}
                      </div>
                      <button onClick={() => solicitarParceria(l.id)} disabled={acao === l.id}
                        className="shrink-0 bg-[#1B2129] border border-[#232A32] hover:border-[#C1441E]/60 text-white text-xs font-semibold px-3 py-2 rounded-lg transition disabled:opacity-50">
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
            <h2 className="text-white font-semibold mb-2 flex items-center gap-2"><Star size={16} className="text-[#E0632C]" /> Avaliação dos clientes</h2>
            {avaliacoes.length === 0 ? (
              <p className="text-gray-500 text-sm">Você ainda não recebeu avaliações.</p>
            ) : (
              <div className="bg-[#12161B] border border-[#232A32] rounded-2xl p-4">
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
                  <div className="flex flex-col gap-2 mt-3 pt-3 border-t border-[#232A32]">
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
