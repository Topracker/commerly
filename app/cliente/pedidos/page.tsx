'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useCliente } from '../../hooks/useCliente'
import { useToast } from '../../hooks/useToast'
import { Toast } from '../../components/Toast'
import { ClienteLayout } from '../../components/ClienteLayout'
import { ConfirmModal } from '../../components/ConfirmModal'
import { Estrelas } from '../../components/Estrelas'
import { MapaAoVivo } from '../../components/MapaAoVivo'
import { STATUS_META, FLUXO_STATUS, pedidoEmAndamento, type PedidoCliente } from '../../lib/pedidosClientes'
import type { LocalizacaoEntrega } from '../../lib/entregadores'
import { distanciaKm, etaMinutos, formatarEta, formatarDistancia } from '../../lib/geo'
import { uploadFotoAvaliacao, enviarAvaliacao, VIEW_AVAL_LOJAS, VIEW_AVAL_ENTREGADORES } from '../../lib/avaliacoes'
import { ShoppingBag, MapPin, ChevronRight, Bike, KeyRound, XCircle, Clock, Camera, Loader2, CalendarClock, Check } from 'lucide-react'

type EntregadorPublico = { id: string; nome: string; foto_url: string | null; telefone: string | null }

export default function ClientePedidos() {
  const { cliente, loading, supabase, sair } = useCliente()
  const { toast, mostrarToast } = useToast()
  const [pedidos, setPedidos] = useState<PedidoCliente[]>([])
  const [nomesLoja, setNomesLoja] = useState<Record<string, string>>({})
  const [entregadores, setEntregadores] = useState<Record<string, EntregadorPublico>>({})
  const [localizacoes, setLocalizacoes] = useState<Record<string, LocalizacaoEntrega>>({})
  const [carregando, setCarregando] = useState(true)

  // Avaliações
  const [ratedEntregador, setRatedEntregador] = useState<Set<string>>(new Set())
  const [avalLoja, setAvalLoja] = useState<Record<string, { id: string; nota: number; comentario: string | null; foto_url: string | null }>>({})
  const [notaEnt, setNotaEnt] = useState<Record<string, number>>({})
  const [comentEnt, setComentEnt] = useState<Record<string, string>>({})
  const [notaLoja, setNotaLoja] = useState<Record<string, number>>({})
  const [comentLoja, setComentLoja] = useState<Record<string, string>>({})
  // Foto opcional anexada à avaliação da loja (câmera ou galeria).
  const [fotoLoja, setFotoLoja] = useState<Record<string, { file: File; preview: string }>>({})
  const [enviando, setEnviando] = useState<string | null>(null)

  // Cancelamento de pedido (só enquanto "recebido").
  const [cancelarId, setCancelarId] = useState<string | null>(null)
  const [cancelando, setCancelando] = useState(false)

  const router = useRouter()

  useEffect(() => { if (cliente) carregar(false) }, [cliente])

  // Enquanto houver pedido em andamento, atualiza tudo a cada 10s (status,
  // código, posição do entregador) — o acompanhamento fica "ao vivo".
  const temAndamento = pedidos.some(p => pedidoEmAndamento(p.status))
  useEffect(() => {
    if (!temAndamento) return
    const iv = setInterval(() => carregar(true), 10_000)
    return () => clearInterval(iv)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [temAndamento])

  // Volta do Stripe Checkout. Em ?pagamento=sucesso o pedido é criado pelo
  // webhook (assíncrono) — recarrega algumas vezes até ele aparecer.
  useEffect(() => {
    if (!cliente) return
    const pg = new URLSearchParams(window.location.search).get('pagamento')
    if (pg === 'sucesso') {
      mostrarToast('Pagamento confirmado! Preparando seu pedido...', 'sucesso')
      const t1 = setTimeout(() => carregar(true), 2500)
      const t2 = setTimeout(() => carregar(true), 6000)
      return () => { clearTimeout(t1); clearTimeout(t2) }
    } else if (pg === 'cancelado') {
      // Cobre desistência E recusa/bloqueio antifraude (Radar) no Checkout: em
      // ambos o cliente volta por aqui sem pedido criado.
      mostrarToast('Pagamento não concluído. Se o cartão foi recusado, tente outro cartão ou escolha pagar na entrega.', 'erro')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cliente])

  async function carregar(silencioso: boolean) {
    if (!silencioso) setCarregando(true)
    const { data } = await supabase
      .from('pedidos_clientes').select('*')
      .eq('cliente_id', cliente.id)
      .order('created_at', { ascending: false })

    const lista = (data || []) as PedidoCliente[]
    setPedidos(lista)

    const lojaIds = [...new Set(lista.map(p => p.loja_id))]
    if (lojaIds.length > 0) {
      const { data: lojas } = await supabase.from('lojas_publicas').select('id, nome').in('id', lojaIds)
      const mapa: Record<string, string> = {}
      for (const l of lojas || []) mapa[l.id] = l.nome
      setNomesLoja(mapa)
    }

    // Entregadores atribuídos (nome/foto/telefone).
    const entIds = [...new Set(lista.map(p => p.entregador_id).filter(Boolean) as string[])]
    if (entIds.length > 0) {
      // `entregadores_publicos` nunca funcionou aqui: ela é security_invoker
      // sobre uma tabela com RLS dono-only, então o cliente recebia SEMPRE zero
      // linhas (o nome/telefone do entregador simplesmente não aparecia).
      // `entregadores_contato` devolve o entregador de quem tem vínculo com ele
      // — o cliente do pedido ou a loja — e nada para mais ninguém.
      const { data: ents } = await supabase.from('entregadores_contato').select('id, nome, foto_url, telefone').in('id', entIds)
      const em: Record<string, EntregadorPublico> = {}
      for (const e of (ents || []) as EntregadorPublico[]) em[e.id] = e
      setEntregadores(em)
    }

    // Posição em tempo real dos pedidos que saíram para entrega.
    const saiu = lista.filter(p => p.status === 'saiu' && p.entregador_id).map(p => p.id)
    if (saiu.length > 0) {
      const { data: locs } = await supabase.from('entregas_localizacao').select('*').in('pedido_id', saiu)
      const lm: Record<string, LocalizacaoEntrega> = {}
      for (const l of (locs || []) as LocalizacaoEntrega[]) lm[l.pedido_id] = l
      setLocalizacoes(lm)
      // Reentrega automática: pede ao servidor para checar se o entregador sumiu
      // (10min sem GPS). Só age quando a inatividade é confirmada no servidor.
      for (const id of saiu) {
        fetch('/api/entrega/checar-entregador', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pedido_id: id }),
        }).catch(() => {})
      }
    } else {
      setLocalizacoes({})
    }

    // Avaliações já feitas (para não repetir).
    const entregues = lista.filter(p => p.status === 'entregue')
    const comEntregador = entregues.filter(p => p.entregador_id).map(p => p.id)
    if (comEntregador.length > 0) {
      const { data: av } = await supabase.from(VIEW_AVAL_ENTREGADORES).select('pedido_id').in('pedido_id', comEntregador)
      setRatedEntregador(new Set((av || []).map((a: any) => a.pedido_id)))
    }
    // `id` é necessário para editar: a nova avaliação substitui esta.
    const { data: avl } = await supabase.from(VIEW_AVAL_LOJAS).select('id, loja_id, nota, comentario, foto_url').eq('cliente_id', cliente.id)
    const am: Record<string, { id: string; nota: number; comentario: string | null; foto_url: string | null }> = {}
    for (const a of (avl || []) as any[]) am[a.loja_id] = { id: a.id, nota: a.nota, comentario: a.comentario, foto_url: a.foto_url ?? null }
    setAvalLoja(am)

    setCarregando(false)
  }

  async function avaliarEntregador(p: PedidoCliente) {
    const nota = notaEnt[p.id] || 0
    if (nota === 0) { mostrarToast('Selecione uma nota para o entregador', 'erro'); return }
    if (!p.entregador_id) return
    setEnviando(`ent-${p.id}`)
    const res = await enviarAvaliacao({
      alvo: 'entregador',
      alvo_id: p.entregador_id,
      pedido_id: p.id,
      nota,
      comentario: comentEnt[p.id]?.trim() || null,
    })
    setEnviando(null)
    if ('error' in res) { mostrarToast(res.error, 'erro'); return }
    setRatedEntregador(prev => new Set(prev).add(p.id))
    mostrarToast('Obrigado por avaliar o entregador!', 'sucesso')
  }

  async function avaliarLoja(p: PedidoCliente) {
    const nota = notaLoja[p.loja_id] || 0
    if (nota === 0) { mostrarToast('Selecione uma nota para o produto', 'erro'); return }
    setEnviando(`loja-${p.id}`)
    const comentario = comentLoja[p.loja_id]?.trim() || null
    const existente = avalLoja[p.loja_id]

    // Envia a foto (se anexada) antes de gravar a avaliação.
    let foto_url = existente?.foto_url ?? null
    const nova = fotoLoja[p.loja_id]
    if (nova) {
      const up = await uploadFotoAvaliacao(supabase, `loja/${cliente.id}`, nova.file)
      if ('error' in up) { setEnviando(null); mostrarToast(up.error, 'erro'); return }
      foto_url = up.url
    }

    const res = await enviarAvaliacao({
      alvo: 'loja',
      alvo_id: p.loja_id,
      nota,
      comentario,
      foto_url,
      substitui_id: existente?.id ?? null,
    })
    setEnviando(null)
    if ('error' in res) { mostrarToast(res.error, 'erro'); return }
    setAvalLoja(prev => ({ ...prev, [p.loja_id]: { id: res.id, nota, comentario, foto_url } }))
    setFotoLoja(prev => { const n = { ...prev }; delete n[p.loja_id]; return n })
    mostrarToast('Avaliação do produto enviada!', 'sucesso')
  }

  function selecionarFotoLoja(lojaId: string, file: File | undefined) {
    if (!file) return
    if (file.size > 6 * 1024 * 1024) { mostrarToast('A foto deve ter no máximo 6 MB.', 'erro'); return }
    setFotoLoja(prev => ({ ...prev, [lojaId]: { file, preview: URL.createObjectURL(file) } }))
  }

  async function cancelarPedido() {
    if (!cancelarId) return
    setCancelando(true)
    try {
      const res = await fetch('/api/cliente/cancelar-pedido', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pedido_id: cancelarId }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { mostrarToast(d.error || 'Não foi possível cancelar o pedido.', 'erro'); return }
      mostrarToast(d.estornado ? 'Pedido cancelado. O estorno já foi solicitado no seu cartão.' : 'Pedido cancelado.', 'sucesso')
      setCancelarId(null)
      carregar(true)
    } catch {
      mostrarToast('Erro de rede ao cancelar. Tente novamente.', 'erro')
    } finally {
      setCancelando(false)
    }
  }

  if (loading) return (
    <main className="min-h-screen bg-gray-950 flex items-center justify-center"><p className="text-gray-400">Carregando...</p></main>
  )
  if (!cliente) return null

  return (
    <ClienteLayout cliente={cliente} sair={sair}>
      <Toast toast={toast} />
      <ConfirmModal
        aberto={!!cancelarId}
        titulo="Cancelar pedido"
        mensagem={
          pedidos.find(p => p.id === cancelarId)?.pagamento_metodo === 'online'
            ? 'Tem certeza? O pedido será cancelado e o valor pago será estornado no seu cartão.'
            : 'Tem certeza que deseja cancelar este pedido?'
        }
        textoBotao={cancelando ? 'Cancelando...' : 'Cancelar pedido'}
        onConfirm={cancelarPedido}
        onCancel={() => { if (!cancelando) setCancelarId(null) }}
      />
      <div className="max-w-2xl mx-auto font-body">
        <h1 className="font-display text-2xl font-bold text-white mb-1">Meus pedidos</h1>
        <p className="text-gray-400 text-sm mb-6">Acompanhe o status das suas entregas em tempo real</p>

        {carregando ? (
          <p className="text-gray-500 text-sm">Carregando...</p>
        ) : pedidos.length === 0 ? (
          <div className="bg-card border border-borda rounded-2xl p-8 text-center">
            <ShoppingBag size={40} className="text-gray-600 mx-auto mb-3" />
            <p className="text-gray-400 text-sm">Você ainda não fez nenhum pedido.</p>
            <button onClick={() => router.push('/cliente/buscar')} className="mt-4 inline-flex items-center gap-1.5 text-green-400 text-sm font-medium hover:text-green-300">
              Buscar lojas <ChevronRight size={16} />
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {pedidos.map(p => {
              const meta = STATUS_META[p.status]
              const passoAtual = FLUXO_STATUS.indexOf(p.status)
              const entregador = p.entregador_id ? entregadores[p.entregador_id] : null
              const loc = localizacoes[p.id]
              // ETA dinâmico: distância entre a posição atual do entregador (GPS
              // ao vivo) e o ponto de entrega → ~5 min/km. Recalcula a cada 10s.
              const distEta = (p.status === 'saiu' && loc && p.entrega_latitude != null && p.entrega_longitude != null)
                ? distanciaKm(
                    { latitude: Number(loc.latitude), longitude: Number(loc.longitude) },
                    { latitude: Number(p.entrega_latitude), longitude: Number(p.entrega_longitude) },
                  )
                : null
              const eta = etaMinutos(distEta)
              // Previsão de entrega = (preparo, se ainda não saiu) + deslocamento.
              const emAndamento = pedidoEmAndamento(p.status)
              const prepMin = p.tempo_preparo_min ?? 30
              const travelMin = (p.status === 'saiu' && eta != null) ? eta : (etaMinutos(p.distancia_km ?? null) ?? 0)
              const previsaoMin = p.status === 'saiu' ? travelMin : prepMin + travelMin
              const previsao = emAndamento && previsaoMin > 0 ? new Date(Date.now() + previsaoMin * 60000) : null
              // "Aguardando entregador": pronto/preparando/saiu mas sem entregador.
              const aguardandoEntregador = emAndamento && !p.entregador_id && (p.status === 'preparando' || p.status === 'saiu')
              const jaAvaliouLoja = !!avalLoja[p.loja_id]
              const jaAvaliouEnt = ratedEntregador.has(p.id)
              return (
                <div key={p.id} className="bg-card border border-borda rounded-2xl p-4">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="min-w-0">
                      <p className="text-white font-semibold truncate">{nomesLoja[p.loja_id] || 'Loja'}</p>
                      <p className="text-gray-500 text-xs">{new Date(p.created_at).toLocaleString('pt-BR')}</p>
                    </div>
                    <span className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full border ${meta.classes}`}>{meta.emoji} {meta.label}</span>
                  </div>

                  {/* Timeline: um marco por etapa, com a atual pulsando. */}
                  {p.status !== 'cancelado' && (
                    <div className="flex items-start mb-4 mt-1">
                      {FLUXO_STATUS.map((s, i) => {
                        const feito = i < passoAtual
                        const atual = i === passoAtual
                        const meta_s = STATUS_META[s]
                        return (
                          <div key={s} className="flex-1 flex flex-col items-center relative">
                            {/* Linha até o próximo marco */}
                            {i < FLUXO_STATUS.length - 1 && (
                              <span
                                className={`absolute top-3 left-1/2 w-full h-0.5 ${feito ? meta_s.dot : 'bg-borda'}`}
                                aria-hidden
                              />
                            )}
                            <span
                              className={`relative z-10 w-6 h-6 rounded-full flex items-center justify-center text-[10px] transition ${
                                feito ? `${meta_s.dot} text-white`
                                  : atual ? `${meta_s.dot} text-white ring-4 ring-white/10`
                                  : 'bg-borda text-gray-600'
                              }`}
                            >
                              {feito ? <Check size={12} /> : atual ? <span className="w-2 h-2 rounded-full bg-white animate-pulse" /> : ''}
                            </span>
                            <span className={`mt-1.5 text-[10px] text-center leading-tight ${atual ? 'text-white font-semibold' : feito ? 'text-gray-400' : 'text-gray-600'}`}>
                              {meta_s.label}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* Previsão de entrega (preparo + deslocamento) */}
                  {previsao && (
                    <div className="mb-3 flex items-center gap-2 text-sm">
                      <CalendarClock size={16} className="text-acento shrink-0" />
                      <span className="text-gray-400">Previsão de entrega:</span>
                      <span className="text-white font-semibold">{previsao.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  )}

                  {/* AGUARDANDO ENTREGADOR — pronto mas sem entregador atribuído */}
                  {aguardandoEntregador && (
                    <div className="mb-3 bg-amber-500/10 border border-amber-500/40 rounded-xl p-3 flex items-center gap-3">
                      <Loader2 size={20} className="text-amber-300 shrink-0 animate-spin" />
                      <div className="min-w-0">
                        <p className="text-amber-200 font-semibold text-sm">Seu pedido está pronto! Buscando entregador...</p>
                        <p className="text-gray-400 text-xs">Assim que um entregador aceitar, você acompanha em tempo real aqui.</p>
                      </div>
                    </div>
                  )}

                  {/* ETA dinâmico — "Chegando em X minutos" (atualiza a cada 10s) */}
                  {p.status === 'saiu' && eta != null && (
                    <div className="mb-3 bg-green-500/10 border border-green-500/40 rounded-xl p-3 flex items-center gap-3">
                      <Clock size={20} className="text-green-400 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-green-300 font-semibold text-sm">Chegando em ~{formatarEta(eta)}</p>
                        <p className="text-gray-400 text-xs">
                          Seu entregador está a {formatarDistancia(distEta)} de você
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Código de confirmação (quando saiu para entrega) */}
                  {p.status === 'saiu' && p.codigo_confirmacao && (
                    <div className="mb-3 bg-acento/10 border border-acento/40 rounded-xl p-3 flex items-center gap-3">
                      <KeyRound size={20} className="text-acento shrink-0" />
                      <div className="min-w-0">
                        <p className="text-gray-300 text-xs">Passe este código ao entregador na entrega:</p>
                        <p className="font-display text-white font-bold text-2xl tracking-[0.3em]">{p.codigo_confirmacao}</p>
                      </div>
                    </div>
                  )}

                  {/* Entregador + mapa ao vivo */}
                  {entregador && pedidoEmAndamento(p.status) && (
                    <div className="mb-3">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-8 h-8 rounded-full bg-acento/15 overflow-hidden flex items-center justify-center shrink-0">
                          {entregador.foto_url ? <img src={entregador.foto_url} alt="" className="w-full h-full object-cover" /> : <Bike size={15} className="text-acento" />}
                        </div>
                        <div className="min-w-0">
                          <p className="text-white text-sm font-medium truncate">{entregador.nome}</p>
                          <p className="text-gray-500 text-xs">Seu entregador</p>
                        </div>
                        {entregador.telefone && (
                          <a href={`https://wa.me/55${entregador.telefone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="ml-auto text-green-400 text-xs hover:text-green-300">WhatsApp</a>
                        )}
                      </div>
                      {p.status === 'saiu' && (
                        loc ? (
                          <MapaAoVivo lat={Number(loc.latitude)} lng={Number(loc.longitude)} altura="h-52" label={entregador.nome} />
                        ) : (
                          <p className="text-gray-500 text-xs bg-superficie border border-borda rounded-xl p-3">Aguardando o sinal de GPS do entregador...</p>
                        )
                      )}
                    </div>
                  )}

                  <div className="text-sm text-gray-300 flex flex-col gap-1">
                    {p.itens.map((it, i) => (
                      <div key={i} className="flex justify-between gap-2">
                        <span className="truncate">{it.quantidade}× {it.nome}</span>
                        <span className="text-gray-500 shrink-0">R$ {(it.preco * it.quantidade).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>

                  {Number(p.taxa_entrega) > 0 && (
                    <div className="flex justify-between gap-2 text-xs text-gray-500 mt-1">
                      <span>Taxa de entrega</span>
                      <span>R$ {Number(p.taxa_entrega).toFixed(2)}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-2 mt-3 pt-3 border-t border-borda">
                    <p className="text-gray-500 text-xs flex items-center gap-1.5 min-w-0">
                      <MapPin size={13} className="shrink-0" /><span className="truncate">{p.endereco_entrega}</span>
                    </p>
                    <p className="font-display text-white font-bold shrink-0">R$ {Number(p.total).toFixed(2)}</p>
                  </div>
                  <div className="flex justify-end mt-1.5">
                    {p.pagamento_metodo === 'online' ? (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/15 text-green-300 font-medium">
                        💳 Pago online
                      </span>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 font-medium">
                        💵 Pagar na entrega
                      </span>
                    )}
                  </div>
                  {p.observacao && <p className="text-gray-500 text-xs mt-2 italic">"{p.observacao}"</p>}

                  {/* Cancelar — só enquanto a loja ainda não começou a preparar */}
                  {p.status === 'recebido' && (
                    <button
                      onClick={() => setCancelarId(p.id)}
                      className="mt-3 w-full flex items-center justify-center gap-1.5 bg-elevado border border-borda hover:bg-red-500/15 hover:border-red-500/40 text-gray-300 hover:text-red-400 text-sm font-medium py-2.5 rounded-xl transition"
                    >
                      <XCircle size={15} /> Cancelar pedido
                    </button>
                  )}

                  {/* Comprovante de entrega (foto do entregador) */}
                  {p.status === 'entregue' && p.comprovante_entrega_url && (
                    <div className="mt-3 pt-3 border-t border-borda">
                      <p className="text-gray-400 text-xs mb-1.5 flex items-center gap-1.5"><Camera size={13} className="text-acento" /> Comprovante de entrega</p>
                      <a href={p.comprovante_entrega_url} target="_blank" rel="noopener noreferrer" className="inline-block">
                        <img src={p.comprovante_entrega_url} alt="Comprovante de entrega" className="w-28 h-28 rounded-xl object-cover border border-borda" />
                      </a>
                    </div>
                  )}

                  {/* Avaliação pós-entrega */}
                  {p.status === 'entregue' && (
                    <div className="mt-3 pt-3 border-t border-borda flex flex-col gap-4">
                      {/* Entregador */}
                      {p.entregador_id && (
                        jaAvaliouEnt ? (
                          <p className="text-green-400 text-xs">✓ Você avaliou o entregador. Obrigado!</p>
                        ) : (
                          <div className="flex flex-col gap-2">
                            <p className="text-gray-300 text-sm font-medium flex items-center gap-1.5"><Bike size={14} className="text-acento" /> Como foi a entrega?</p>
                            <Estrelas nota={notaEnt[p.id] || 0} onSelect={n => setNotaEnt(prev => ({ ...prev, [p.id]: n }))} tamanho="text-xl" />
                            <input
                              value={comentEnt[p.id] || ''}
                              onChange={e => setComentEnt(prev => ({ ...prev, [p.id]: e.target.value }))}
                              placeholder="Comentário (opcional)"
                              className="bg-superficie border border-borda text-white rounded-xl px-3 py-2 outline-none focus:border-acento/60 text-sm"
                            />
                            <button onClick={() => avaliarEntregador(p)} disabled={enviando === `ent-${p.id}`}
                              className="self-start bg-azul hover:brightness-110 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-xl transition">
                              {enviando === `ent-${p.id}` ? 'Enviando...' : 'Avaliar entregador'}
                            </button>
                          </div>
                        )
                      )}
                      {/* Produto / loja */}
                      <div className="flex flex-col gap-2">
                        <p className="text-gray-300 text-sm font-medium flex items-center gap-1.5"><ShoppingBag size={14} className="text-acento" /> Avalie o produto {jaAvaliouLoja && <span className="text-green-400 text-xs">(você já avaliou — pode atualizar)</span>}</p>
                        <Estrelas nota={notaLoja[p.loja_id] ?? avalLoja[p.loja_id]?.nota ?? 0} onSelect={n => setNotaLoja(prev => ({ ...prev, [p.loja_id]: n }))} tamanho="text-xl" />
                        <input
                          value={comentLoja[p.loja_id] ?? avalLoja[p.loja_id]?.comentario ?? ''}
                          onChange={e => setComentLoja(prev => ({ ...prev, [p.loja_id]: e.target.value }))}
                          placeholder="Comentário (opcional)"
                          className="bg-superficie border border-borda text-white rounded-xl px-3 py-2 outline-none focus:border-acento/60 text-sm"
                        />
                        {/* Foto opcional (câmera ou galeria) */}
                        <div className="flex items-center gap-3">
                          {(fotoLoja[p.loja_id]?.preview || avalLoja[p.loja_id]?.foto_url) && (
                            <img src={fotoLoja[p.loja_id]?.preview || avalLoja[p.loja_id]?.foto_url || ''} alt="Foto da avaliação"
                              className="w-14 h-14 rounded-xl object-cover border border-borda" />
                          )}
                          <label className="inline-flex items-center gap-1.5 cursor-pointer bg-superficie border border-borda hover:border-acento/60 text-gray-300 text-xs font-medium px-3 py-2 rounded-xl transition">
                            <Camera size={14} className="text-acento" />
                            {fotoLoja[p.loja_id] || avalLoja[p.loja_id]?.foto_url ? 'Trocar foto' : 'Adicionar foto'}
                            <input type="file" accept="image/*" capture="environment" className="hidden"
                              onChange={e => selecionarFotoLoja(p.loja_id, e.target.files?.[0])} />
                          </label>
                        </div>
                        <button onClick={() => avaliarLoja(p)} disabled={enviando === `loja-${p.id}`}
                          className="self-start bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-xl transition">
                          {enviando === `loja-${p.id}` ? 'Enviando...' : jaAvaliouLoja ? 'Atualizar avaliação' : 'Avaliar produto'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </ClienteLayout>
  )
}
