'use client'
import { useState, useEffect, useMemo, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { useEntregador } from '../../hooks/useEntregador'
import { useToast } from '../../hooks/useToast'
import { Toast } from '../../components/Toast'
import { EntregadorLayout } from '../../components/EntregadorLayout'
import { isDelivery, STATUS_META, type PedidoCliente } from '../../lib/pedidosClientes'
import { STATUS_PARCERIA_META, GPS_INTERVALO_MS, type ParceriaEntregador } from '../../lib/entregadores'
import { Store, MapPin, Navigation, CircleDollarSign, Check, Handshake, PackageCheck, Star, History } from 'lucide-react'

type Avaliacao = { nota: number; comentario: string | null; created_at: string }

export default function EntregadorDashboardPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-gray-950 flex items-center justify-center"><p className="text-gray-400">Carregando...</p></main>}>
      <EntregadorDashboard />
    </Suspense>
  )
}

function EntregadorDashboard() {
  const { entregador, loading, supabase, sair } = useEntregador()
  const { toast, mostrarToast } = useToast()
  const params = useSearchParams()

  const [lojas, setLojas] = useState<any[]>([])
  const [parcerias, setParcerias] = useState<ParceriaEntregador[]>([])
  const [pedidos, setPedidos] = useState<PedidoCliente[]>([])
  const [avaliacoes, setAvaliacoes] = useState<Avaliacao[]>([])
  const [carregando, setCarregando] = useState(true)
  const [acao, setAcao] = useState<string | null>(null)
  const [codigos, setCodigos] = useState<Record<string, string>>({})
  const [gpsAtivo, setGpsAtivo] = useState(false)

  // Stripe Connect
  const [stripeOnboarded, setStripeOnboarded] = useState(false)
  const [stripeHasAccount, setStripeHasAccount] = useState(false)

  useEffect(() => { if (entregador) { carregar(); checarStripe() } }, [entregador])

  useEffect(() => {
    if (params.get('stripe') === 'ok') { checarStripe(); mostrarToast('Conta Stripe conectada!', 'sucesso') }
    if (params.get('stripe') === 'erro') mostrarToast('Não foi possível conectar a Stripe. Tente de novo.', 'erro')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function carregar() {
    const [lojasRes, parceriasRes, pedidosRes, avalRes] = await Promise.all([
      supabase.from('lojas_publicas').select('id, nome, tipo, localizacao'),
      supabase.from('entregador_parcerias').select('*').eq('entregador_id', entregador!.id),
      supabase.from('pedidos_clientes').select('*').order('created_at', { ascending: false }),
      supabase.from('avaliacoes_entregadores').select('nota, comentario, created_at')
        .eq('entregador_id', entregador!.id).order('created_at', { ascending: false }),
    ])
    setLojas((lojasRes.data || []).filter((l: any) => isDelivery(l.tipo)))
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

  const nomeLoja = useMemo(() => {
    const m: Record<string, string> = {}
    for (const l of lojas) m[l.id] = l.nome
    return m
  }, [lojas])

  const parceriaPorLoja = useMemo(() => {
    const m: Record<string, ParceriaEntregador> = {}
    for (const p of parcerias) m[p.loja_id] = p
    return m
  }, [parcerias])

  // Lojas com parceria ACEITA — base para os pedidos disponíveis.
  const lojasAceitasIds = useMemo(
    () => new Set(parcerias.filter(p => p.status === 'aceita').map(p => p.loja_id)),
    [parcerias],
  )
  const temParceriaAceita = lojasAceitasIds.size > 0

  const ativas = pedidos.filter(p => p.entregador_id === entregador?.id && p.status !== 'entregue' && p.status !== 'cancelado')
  // Disponíveis: sem entregador, prontos p/ rota (preparando/saiu) e de loja parceira aceita.
  const disponiveis = pedidos.filter(p =>
    !p.entregador_id &&
    (p.status === 'preparando' || p.status === 'saiu') &&
    lojasAceitasIds.has(p.loja_id),
  )
  const historico = pedidos
    .filter(p => p.entregador_id === entregador?.id && p.status === 'entregue')
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
  const entregasFeitas = historico.length
  const totalRecebido = historico
    .filter(p => p.pagamento_corrida === 'pago')
    .reduce((s, p) => s + (Number(p.valor_corrida) || 0), 0)

  // Avaliação média recebida dos clientes.
  const mediaNota = avaliacoes.length
    ? avaliacoes.reduce((s, a) => s + a.nota, 0) / avaliacoes.length
    : 0
  const comentarios = avaliacoes.filter(a => a.comentario && a.comentario.trim())

  // Parcerias existentes (qualquer status) para a seção "Minhas parcerias".
  const lojasSemParceria = lojas.filter(l => !parceriaPorLoja[l.id])

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
    <main className="min-h-screen bg-gray-950 flex items-center justify-center"><p className="text-gray-400">Carregando...</p></main>
  )
  if (!entregador) return null

  return (
    <EntregadorLayout entregador={entregador} sair={sair} titulo={`Olá, ${entregador.nome.split(' ')[0]}`}>
      <Toast toast={toast} />

      {/* Resumo */}
      <div className="grid grid-cols-3 gap-2 mb-5">
        <div className="bg-[#12161B] border border-[#232A32] rounded-2xl p-3 text-center">
          <p className="text-lg font-bold text-white">{ativas.length}</p>
          <p className="text-gray-500 text-[11px]">Em andamento</p>
        </div>
        <div className="bg-[#12161B] border border-[#232A32] rounded-2xl p-3 text-center">
          <p className="text-lg font-bold text-[#6FD98F]">{entregasFeitas}</p>
          <p className="text-gray-500 text-[11px]">Entregues</p>
        </div>
        <div className="bg-[#12161B] border border-[#232A32] rounded-2xl p-3 text-center">
          <p className="text-lg font-bold text-amber-300 flex items-center justify-center gap-1">
            <Star size={14} className="fill-amber-300 text-amber-300" />
            {avaliacoes.length ? mediaNota.toFixed(1) : '—'}
          </p>
          <p className="text-gray-500 text-[11px]">{avaliacoes.length ? `${avaliacoes.length} avaliação${avaliacoes.length > 1 ? 'ões' : ''}` : 'Sem avaliações'}</p>
        </div>
      </div>

      {/* Stripe Connect */}
      <div className={`rounded-2xl p-4 mb-5 border ${stripeOnboarded ? 'bg-green-500/10 border-green-500/40' : 'bg-[#12161B] border-[#232A32]'}`}>
        <div className="flex items-center gap-3">
          <CircleDollarSign size={20} className={stripeOnboarded ? 'text-green-400' : 'text-[#E0632C]'} />
          <div className="flex-1 min-w-0">
            <p className="text-white font-semibold text-sm">Recebimento das corridas</p>
            <p className="text-gray-400 text-xs">
              {stripeOnboarded ? 'Conta pronta para receber via Stripe.' : 'Conecte sua conta para receber o valor das corridas.'}
            </p>
          </div>
          {!stripeOnboarded && (
            <button
              onClick={() => { window.location.href = '/api/entregador/stripe-connect' }}
              className="shrink-0 bg-[#635BFF] hover:bg-[#5249e0] text-white text-xs font-semibold px-3 py-2 rounded-lg transition"
            >
              {stripeHasAccount ? 'Continuar' : 'Conectar'}
            </button>
          )}
          {stripeOnboarded && <Check size={18} className="text-green-400 shrink-0" />}
        </div>
      </div>

      {carregando ? (
        <p className="text-gray-500 text-sm">Carregando...</p>
      ) : (
        <div className="flex flex-col gap-6">
          {/* Minhas entregas ativas */}
          {ativas.length > 0 && (
            <section>
              <h2 className="text-white font-semibold mb-2 flex items-center gap-2">
                <Navigation size={16} className="text-[#E0632C]" /> Minhas entregas ativas
                {gpsAtivo && <span className="text-[10px] font-medium text-green-400 bg-green-500/15 px-2 py-0.5 rounded-full">● GPS ao vivo</span>}
              </h2>
              <div className="flex flex-col gap-3">
                {ativas.map(p => {
                  const meta = STATUS_META[p.status]
                  return (
                    <div key={p.id} className="bg-[#12161B] border border-[#232A32] rounded-2xl p-4">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <p className="text-white font-semibold truncate">{nomeLoja[p.loja_id] || 'Loja'}</p>
                        <span className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full border ${meta.classes}`}>{meta.emoji} {meta.label}</span>
                      </div>
                      <p className="text-gray-400 text-xs flex items-start gap-1.5 mb-1"><MapPin size={13} className="shrink-0 mt-0.5" />{p.endereco_entrega}</p>
                      {p.cliente_telefone && (
                        <a href={`https://wa.me/55${p.cliente_telefone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="text-green-400 text-xs hover:text-green-300">{p.cliente_telefone}</a>
                      )}
                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-[#232A32]">
                        <span className="text-gray-500 text-xs">Corrida</span>
                        <span className="text-[#6FD98F] font-bold text-sm">{Number(p.valor_corrida) > 0 ? `R$ ${Number(p.valor_corrida).toFixed(2)}` : 'A definir'}</span>
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
                            <button
                              onClick={() => confirmarEntrega(p.id)}
                              disabled={acao === p.id}
                              className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-semibold rounded-xl transition flex items-center justify-center gap-1.5 text-sm"
                            >
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

          {/* Pedidos disponíveis — só para quem tem parceria aceita */}
          {temParceriaAceita && (
            <section>
              <h2 className="text-white font-semibold mb-2 flex items-center gap-2"><PackageCheck size={16} className="text-[#E0632C]" /> Pedidos disponíveis</h2>
              {disponiveis.length === 0 ? (
                <p className="text-gray-500 text-sm">Nenhum pedido disponível nas suas lojas parceiras agora.</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {disponiveis.map(p => {
                    const meta = STATUS_META[p.status]
                    return (
                      <div key={p.id} className="bg-[#12161B] border border-[#232A32] rounded-2xl p-4">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <p className="text-white font-semibold truncate">{nomeLoja[p.loja_id] || 'Loja'}</p>
                          <span className="text-[#6FD98F] font-bold text-sm shrink-0">{Number(p.valor_corrida) > 0 ? `R$ ${Number(p.valor_corrida).toFixed(2)}` : 'Corrida a definir'}</span>
                        </div>
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${meta.classes}`}>{meta.emoji} {meta.label}</span>
                        </div>
                        <p className="text-gray-400 text-xs flex items-start gap-1.5"><MapPin size={13} className="shrink-0 mt-0.5" />{p.endereco_entrega}</p>
                        <button
                          onClick={() => aceitarPedido(p.id)}
                          disabled={acao === p.id}
                          className="mt-3 w-full bg-[#C1441E] hover:bg-[#a83a19] disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl transition text-sm"
                        >
                          {acao === p.id ? 'Aceitando...' : 'Aceitar pedido'}
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </section>
          )}

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
                        <p className="text-white font-semibold text-sm truncate">{nomeLoja[parceria.loja_id] || 'Loja'}</p>
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

            {/* Solicitar nova parceria */}
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
                      <button
                        onClick={() => solicitarParceria(l.id)}
                        disabled={acao === l.id}
                        className="shrink-0 bg-[#1B2129] border border-[#232A32] hover:border-[#C1441E]/60 text-white text-xs font-semibold px-3 py-2 rounded-lg transition disabled:opacity-50"
                      >
                        {acao === l.id ? '...' : 'Solicitar'}
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>

          {/* Histórico de entregas concluídas */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-white font-semibold flex items-center gap-2"><History size={16} className="text-[#E0632C]" /> Histórico de entregas</h2>
              {totalRecebido > 0 && (
                <span className="text-[#6FD98F] font-bold text-sm">R$ {totalRecebido.toFixed(2)} recebido</span>
              )}
            </div>
            {historico.length === 0 ? (
              <p className="text-gray-500 text-sm">Você ainda não concluiu nenhuma entrega.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {historico.map(p => (
                  <div key={p.id} className="bg-[#12161B] border border-[#232A32] rounded-2xl p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-white font-semibold text-sm truncate">{nomeLoja[p.loja_id] || 'Loja'}</p>
                        <p className="text-gray-500 text-xs">{new Date(p.updated_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[#6FD98F] font-bold text-sm">{Number(p.valor_corrida) > 0 ? `R$ ${Number(p.valor_corrida).toFixed(2)}` : '—'}</p>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${p.pagamento_corrida === 'pago' ? 'bg-green-500/15 text-green-300 border-green-500/40' : 'bg-amber-500/15 text-amber-300 border-amber-500/40'}`}>
                          {p.pagamento_corrida === 'pago' ? 'Pago' : 'Pendente'}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
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
