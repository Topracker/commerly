'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useCliente } from '../../hooks/useCliente'
import { useToast } from '../../hooks/useToast'
import { Toast } from '../../components/Toast'
import { ClienteLayout } from '../../components/ClienteLayout'
import { Estrelas } from '../../components/Estrelas'
import { MapaAoVivo } from '../../components/MapaAoVivo'
import { STATUS_META, FLUXO_STATUS, pedidoEmAndamento, type PedidoCliente } from '../../lib/pedidosClientes'
import type { LocalizacaoEntrega } from '../../lib/entregadores'
import { ShoppingBag, MapPin, ChevronRight, Bike, KeyRound } from 'lucide-react'

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
  const [avalLoja, setAvalLoja] = useState<Record<string, { nota: number; comentario: string | null }>>({})
  const [notaEnt, setNotaEnt] = useState<Record<string, number>>({})
  const [comentEnt, setComentEnt] = useState<Record<string, string>>({})
  const [notaLoja, setNotaLoja] = useState<Record<string, number>>({})
  const [comentLoja, setComentLoja] = useState<Record<string, string>>({})
  const [enviando, setEnviando] = useState<string | null>(null)

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
      mostrarToast('Pagamento cancelado. Seu pedido não foi feito.', 'erro')
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
      const { data: ents } = await supabase.from('entregadores_publicos').select('id, nome, foto_url, telefone').in('id', entIds)
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
    } else {
      setLocalizacoes({})
    }

    // Avaliações já feitas (para não repetir).
    const entregues = lista.filter(p => p.status === 'entregue')
    const comEntregador = entregues.filter(p => p.entregador_id).map(p => p.id)
    if (comEntregador.length > 0) {
      const { data: av } = await supabase.from('avaliacoes_entregadores').select('pedido_id').in('pedido_id', comEntregador)
      setRatedEntregador(new Set((av || []).map((a: any) => a.pedido_id)))
    }
    const { data: avl } = await supabase.from('avaliacoes_lojas').select('loja_id, nota, comentario').eq('cliente_id', cliente.id)
    const am: Record<string, { nota: number; comentario: string | null }> = {}
    for (const a of (avl || []) as any[]) am[a.loja_id] = { nota: a.nota, comentario: a.comentario }
    setAvalLoja(am)

    setCarregando(false)
  }

  async function avaliarEntregador(p: PedidoCliente) {
    const nota = notaEnt[p.id] || 0
    if (nota === 0) { mostrarToast('Selecione uma nota para o entregador', 'erro'); return }
    if (!p.entregador_id) return
    setEnviando(`ent-${p.id}`)
    const { error } = await supabase.from('avaliacoes_entregadores').insert({
      pedido_id: p.id, entregador_id: p.entregador_id, cliente_id: cliente.id,
      nota, comentario: comentEnt[p.id]?.trim() || null,
    })
    setEnviando(null)
    if (error) { mostrarToast('Erro ao avaliar o entregador', 'erro'); return }
    setRatedEntregador(prev => new Set(prev).add(p.id))
    mostrarToast('Obrigado por avaliar o entregador!', 'sucesso')
  }

  async function avaliarLoja(p: PedidoCliente) {
    const nota = notaLoja[p.loja_id] || 0
    if (nota === 0) { mostrarToast('Selecione uma nota para o produto', 'erro'); return }
    setEnviando(`loja-${p.id}`)
    const comentario = comentLoja[p.loja_id]?.trim() || null
    const existente = avalLoja[p.loja_id]
    const { error } = existente
      ? await supabase.from('avaliacoes_lojas').update({ nota, comentario }).eq('cliente_id', cliente.id).eq('loja_id', p.loja_id)
      : await supabase.from('avaliacoes_lojas').insert({ cliente_id: cliente.id, loja_id: p.loja_id, nota, comentario })
    setEnviando(null)
    if (error) { mostrarToast('Erro ao avaliar o produto', 'erro'); return }
    setAvalLoja(prev => ({ ...prev, [p.loja_id]: { nota, comentario } }))
    mostrarToast('Avaliação do produto enviada!', 'sucesso')
  }

  if (loading) return (
    <main className="min-h-screen bg-gray-950 flex items-center justify-center"><p className="text-gray-400">Carregando...</p></main>
  )
  if (!cliente) return null

  return (
    <ClienteLayout cliente={cliente} sair={sair}>
      <Toast toast={toast} />
      <div className="max-w-2xl mx-auto font-body">
        <h1 className="font-display text-2xl font-bold text-white mb-1">Meus pedidos</h1>
        <p className="text-gray-400 text-sm mb-6">Acompanhe o status das suas entregas em tempo real</p>

        {carregando ? (
          <p className="text-gray-500 text-sm">Carregando...</p>
        ) : pedidos.length === 0 ? (
          <div className="bg-[#12161B] border border-[#232A32] rounded-2xl p-8 text-center">
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
              const jaAvaliouLoja = !!avalLoja[p.loja_id]
              const jaAvaliouEnt = ratedEntregador.has(p.id)
              return (
                <div key={p.id} className="bg-[#12161B] border border-[#232A32] rounded-2xl p-4">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="min-w-0">
                      <p className="text-white font-semibold truncate">{nomesLoja[p.loja_id] || 'Loja'}</p>
                      <p className="text-gray-500 text-xs">{new Date(p.created_at).toLocaleString('pt-BR')}</p>
                    </div>
                    <span className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full border ${meta.classes}`}>{meta.emoji} {meta.label}</span>
                  </div>

                  {p.status !== 'cancelado' && (
                    <div className="flex items-center gap-1 mb-3">
                      {FLUXO_STATUS.map((s, i) => (
                        <div key={s} className={`h-1.5 flex-1 rounded-full ${i <= passoAtual ? STATUS_META[s].dot : 'bg-[#232A32]'}`} />
                      ))}
                    </div>
                  )}

                  {/* Código de confirmação (quando saiu para entrega) */}
                  {p.status === 'saiu' && p.codigo_confirmacao && (
                    <div className="mb-3 bg-[#C1441E]/10 border border-[#C1441E]/40 rounded-xl p-3 flex items-center gap-3">
                      <KeyRound size={20} className="text-[#E0632C] shrink-0" />
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
                        <div className="w-8 h-8 rounded-full bg-[#C1441E]/15 overflow-hidden flex items-center justify-center shrink-0">
                          {entregador.foto_url ? <img src={entregador.foto_url} alt="" className="w-full h-full object-cover" /> : <Bike size={15} className="text-[#E0632C]" />}
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
                          <p className="text-gray-500 text-xs bg-[#171C22] border border-[#232A32] rounded-xl p-3">Aguardando o sinal de GPS do entregador...</p>
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

                  <div className="flex items-center justify-between gap-2 mt-3 pt-3 border-t border-[#232A32]">
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

                  {/* Avaliação pós-entrega */}
                  {p.status === 'entregue' && (
                    <div className="mt-3 pt-3 border-t border-[#232A32] flex flex-col gap-4">
                      {/* Entregador */}
                      {p.entregador_id && (
                        jaAvaliouEnt ? (
                          <p className="text-green-400 text-xs">✓ Você avaliou o entregador. Obrigado!</p>
                        ) : (
                          <div className="flex flex-col gap-2">
                            <p className="text-gray-300 text-sm font-medium flex items-center gap-1.5"><Bike size={14} className="text-[#E0632C]" /> Como foi a entrega?</p>
                            <Estrelas nota={notaEnt[p.id] || 0} onSelect={n => setNotaEnt(prev => ({ ...prev, [p.id]: n }))} tamanho="text-xl" />
                            <input
                              value={comentEnt[p.id] || ''}
                              onChange={e => setComentEnt(prev => ({ ...prev, [p.id]: e.target.value }))}
                              placeholder="Comentário (opcional)"
                              className="bg-[#171C22] border border-[#232A32] text-white rounded-xl px-3 py-2 outline-none focus:border-[#C1441E]/60 text-sm"
                            />
                            <button onClick={() => avaliarEntregador(p)} disabled={enviando === `ent-${p.id}`}
                              className="self-start bg-[#C1441E] hover:bg-[#a83a19] disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-xl transition">
                              {enviando === `ent-${p.id}` ? 'Enviando...' : 'Avaliar entregador'}
                            </button>
                          </div>
                        )
                      )}
                      {/* Produto / loja */}
                      <div className="flex flex-col gap-2">
                        <p className="text-gray-300 text-sm font-medium flex items-center gap-1.5"><ShoppingBag size={14} className="text-[#6FD98F]" /> Avalie o produto {jaAvaliouLoja && <span className="text-green-400 text-xs">(você já avaliou — pode atualizar)</span>}</p>
                        <Estrelas nota={notaLoja[p.loja_id] ?? avalLoja[p.loja_id]?.nota ?? 0} onSelect={n => setNotaLoja(prev => ({ ...prev, [p.loja_id]: n }))} tamanho="text-xl" />
                        <input
                          value={comentLoja[p.loja_id] ?? avalLoja[p.loja_id]?.comentario ?? ''}
                          onChange={e => setComentLoja(prev => ({ ...prev, [p.loja_id]: e.target.value }))}
                          placeholder="Comentário (opcional)"
                          className="bg-[#171C22] border border-[#232A32] text-white rounded-xl px-3 py-2 outline-none focus:border-[#6FD98F]/60 text-sm"
                        />
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
