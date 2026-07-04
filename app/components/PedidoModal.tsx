'use client'
import { useEffect, useMemo, useState } from 'react'
import { X, Plus, Minus, ShoppingBag, MapPin, Check, CreditCard, Banknote } from 'lucide-react'
import type { ItemPedidoCliente } from '../lib/pedidosClientes'
import { distanciaKm, taxaEntregaPorDistancia, formatarDistancia } from '../lib/geo'
import { MapaConfirmar } from './MapaConfirmar'

type Produto = { id: string; nome: string; preco_venda: number | string; categoria?: string | null }

type Sugestao = { lat: number; lng: number; display_name: string }

type Props = {
  loja: { id: string; nome: string; latitude?: number | null; longitude?: number | null; aceita_pagamento_online?: boolean; distancia_maxima_entrega?: number | null }
  cliente: { id: string; nome?: string | null; telefone?: string | null }
  produtos: Produto[]
  supabase: any
  onFechar: () => void
  onSucesso: (msg: string) => void
  onErro: (msg: string) => void
}

// Modal de montagem de pedido (delivery): escolher produtos + quantidades,
// endereço de entrega e observação. Insere em `pedidos_clientes`.
export function PedidoModal({ loja, cliente, produtos, supabase, onFechar, onSucesso, onErro }: Props) {
  const [qtds, setQtds] = useState<Record<string, number>>({})
  const [endereco, setEndereco] = useState('')
  const [observacao, setObservacao] = useState('')
  const [enviando, setEnviando] = useState(false)
  // Forma de pagamento: 'online' (cartão via Stripe) ou 'entrega' (dinheiro/Pix).
  // Oferece online, exceto quando a loja sinaliza explicitamente que não aceita.
  // (A prontidão real é validada no servidor ao criar o checkout — 409 amigável.)
  const aceitaOnline = loja.aceita_pagamento_online !== false
  const [pagamento, setPagamento] = useState<'online' | 'entrega'>('entrega')

  // Autocomplete de endereço (/api/geocode?suggest=1) + confirmação no mapa.
  const [sugestoes, setSugestoes] = useState<Sugestao[]>([])
  const [buscandoSug, setBuscandoSug] = useState(false)
  // Coordenada confirmada da entrega — quando definida, mostra o mini mapa.
  const [coord, setCoord] = useState<{ lat: number; lng: number } | null>(null)

  // Busca sugestões conforme o cliente digita (debounce). Não busca depois de
  // uma seleção (coord já definida) — só volta a buscar se ele editar o texto.
  useEffect(() => {
    if (coord) return
    const q = endereco.trim()
    if (q.length < 4) { setSugestoes([]); setBuscandoSug(false); return }
    let ativo = true
    setBuscandoSug(true)
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/geocode?suggest=1&q=${encodeURIComponent(q)}`)
        const d = await res.json()
        if (ativo) setSugestoes(Array.isArray(d.results) ? d.results : [])
      } catch {
        if (ativo) setSugestoes([])
      } finally {
        if (ativo) setBuscandoSug(false)
      }
    }, 450)
    return () => { ativo = false; clearTimeout(t) }
  }, [endereco, coord])

  function mudarEndereco(v: string) {
    setEndereco(v)
    // Texto mudou → a confirmação anterior não vale mais.
    if (coord) setCoord(null)
  }

  function selecionarSugestao(s: Sugestao) {
    setEndereco(s.display_name)
    setCoord({ lat: s.lat, lng: s.lng })
    setSugestoes([])
  }

  function mudarQtd(id: string, delta: number) {
    setQtds(prev => {
      const atual = prev[id] || 0
      const nova = Math.max(0, atual + delta)
      const next = { ...prev }
      if (nova === 0) delete next[id]
      else next[id] = nova
      return next
    })
  }

  const itens: ItemPedidoCliente[] = useMemo(
    () =>
      produtos
        .filter(p => (qtds[p.id] || 0) > 0)
        .map(p => ({
          produto_id: p.id,
          nome: p.nome,
          preco: parseFloat(String(p.preco_venda)) || 0,
          quantidade: qtds[p.id],
        })),
    [produtos, qtds],
  )

  const subtotal = useMemo(() => itens.reduce((s, i) => s + i.preco * i.quantidade, 0), [itens])
  // Taxa AUTOMÁTICA por distância loja→entrega. Só dá pra calcular depois que o
  // cliente confirma o ponto no mapa (coord). O valor definitivo é recalculado
  // no servidor (trigger) — aqui é só a prévia para o cliente ver antes.
  const distancia = coord
    ? distanciaKm({ latitude: loja.latitude, longitude: loja.longitude }, { latitude: coord.lat, longitude: coord.lng })
    : null
  const taxaEntrega = coord ? taxaEntregaPorDistancia(distancia) : null
  const total = subtotal + (taxaEntrega ?? 0)
  const totalItens = itens.reduce((s, i) => s + i.quantidade, 0)

  // Distância máxima da loja (km). Fora da área -> bloqueia o pedido.
  const distMax = loja.distancia_maxima_entrega != null ? Number(loja.distancia_maxima_entrega) : null
  const foraDeArea = distancia != null && distMax != null && distancia > distMax

  async function enviar() {
    if (itens.length === 0) { onErro('Escolha pelo menos um produto.'); return }
    if (!endereco.trim()) { onErro('Informe o endereço de entrega.'); return }
    if (!coord) { onErro('Selecione o endereço nas sugestões e confirme o ponto no mapa para calcular a taxa.'); return }
    if (foraDeArea) { onErro(`Endereço fora da área de entrega. Esta loja entrega até ${distMax} km.`); return }
    setEnviando(true)

    // Pagamento ONLINE: cria a sessão de checkout no servidor e vai pro Stripe.
    // O pedido só é criado após o pagamento confirmado (webhook).
    if (pagamento === 'online') {
      try {
        const res = await fetch('/api/cliente/pedido-checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            loja_id: loja.id,
            itens,
            endereco_entrega: endereco.trim(),
            entrega_latitude: coord.lat,
            entrega_longitude: coord.lng,
            observacao: observacao.trim() || null,
          }),
        })
        const d = await res.json().catch(() => ({}))
        if (!res.ok || !d.url) {
          onErro(d.error || 'Não foi possível iniciar o pagamento online.')
          setEnviando(false)
          return
        }
        window.location.href = d.url // redireciona para o Stripe Checkout
      } catch {
        onErro('Erro de rede ao iniciar o pagamento. Tente novamente.')
        setEnviando(false)
      }
      return
    }

    // Pagamento NA ENTREGA (dinheiro/Pix): cria o pedido direto.
    const { error } = await supabase.from('pedidos_clientes').insert({
      loja_id: loja.id,
      cliente_id: cliente.id,
      itens,
      // total/taxa são recalculados no servidor (trigger) — enviados só por
      // completude; o valor autoritativo vem do banco.
      total,
      taxa_entrega: taxaEntrega,
      entrega_latitude: coord.lat,
      entrega_longitude: coord.lng,
      endereco_entrega: endereco.trim(),
      observacao: observacao.trim() || null,
      cliente_nome: cliente.nome || null,
      cliente_telefone: cliente.telefone || null,
      // pagamento_metodo default 'entrega' no banco — omitido para não quebrar
      // caso a coluna ainda não exista (pré-migração).
    })
    if (error) { onErro('Não foi possível enviar o pedido. Tente novamente.'); setEnviando(false); return }
    setEnviando(false)
    onSucesso('Pedido enviado! Acompanhe em "Meus pedidos".')
    onFechar()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onFechar} />
      <div className="relative z-10 w-full sm:max-w-lg bg-[#12161B] border border-[#232A32] sm:rounded-2xl rounded-t-2xl max-h-[92vh] flex flex-col font-body">
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-[#232A32] shrink-0">
          <div className="min-w-0">
            <h2 className="font-display text-white font-bold text-lg truncate">Fazer pedido</h2>
            <p className="text-gray-500 text-xs truncate">{loja.nome}</p>
          </div>
          <button onClick={onFechar} className="shrink-0 text-gray-400 hover:text-white"><X size={22} /></button>
        </div>

        <div className="overflow-y-auto px-5 py-4 flex flex-col gap-4 min-h-0">
          <div>
            <p className="text-gray-300 text-sm font-medium mb-2">Produtos</p>
            <div className="flex flex-col gap-2">
              {produtos.map(p => {
                const q = qtds[p.id] || 0
                const preco = parseFloat(String(p.preco_venda)) || 0
                return (
                  <div key={p.id} className={`flex items-center gap-3 rounded-xl border p-2.5 transition ${q > 0 ? 'border-[#C1441E]/60 bg-[#1B2129]' : 'border-[#232A32] bg-[#171C22]'}`}>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-medium truncate">{p.nome}</p>
                      <p className="text-[#6FD98F] font-display font-bold text-sm">R$ {preco.toFixed(2)}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => mudarQtd(p.id, -1)}
                        disabled={q === 0}
                        aria-label="Diminuir"
                        className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#232A32] text-white disabled:opacity-30 hover:bg-[#2c343d] transition"
                      >
                        <Minus size={16} />
                      </button>
                      <span className="w-6 text-center text-white font-semibold tabular-nums">{q}</span>
                      <button
                        onClick={() => mudarQtd(p.id, 1)}
                        aria-label="Aumentar"
                        className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#C1441E] text-white hover:bg-[#a83a19] transition"
                      >
                        <Plus size={16} />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div>
            <label className="text-gray-300 text-sm font-medium mb-2 flex items-center gap-1.5">
              <MapPin size={14} className="text-gray-500" /> Endereço de entrega
            </label>
            <div className="relative">
              <input
                value={endereco}
                onChange={e => mudarEndereco(e.target.value)}
                placeholder="Digite rua, número, bairro, cidade..."
                autoComplete="off"
                className="w-full bg-[#171C22] border border-[#232A32] text-white rounded-xl px-4 py-3 pr-24 outline-none focus:border-[#C1441E]/60 text-sm"
              />
              {buscandoSug && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs">buscando...</span>
              )}
            </div>

            {/* Sugestões (in-flow pra não serem cortadas pelo scroll do modal). */}
            {sugestoes.length > 0 && (
              <ul className="mt-1.5 flex flex-col gap-0.5 rounded-xl border border-[#232A32] bg-[#171C22] p-1">
                {sugestoes.map((s, i) => (
                  <li key={`${s.lat},${s.lng},${i}`}>
                    <button
                      type="button"
                      onClick={() => selecionarSugestao(s)}
                      className="w-full text-left px-3 py-2 rounded-lg text-gray-300 text-sm hover:bg-[#232A32] transition flex items-start gap-2"
                    >
                      <MapPin size={14} className="text-gray-500 shrink-0 mt-0.5" />
                      <span className="min-w-0">{s.display_name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {/* Mini mapa de confirmação — pino arrastável pra ajustar o ponto. */}
            {coord && (
              <div className="mt-2 flex flex-col gap-1.5">
                <p className="text-gray-400 text-xs flex items-center gap-1.5">
                  <Check size={12} className="text-green-500 shrink-0" />
                  Confirme o ponto de entrega — <strong>arraste</strong> o pino ou clique no mapa para ajustar.
                </p>
                <MapaConfirmar lat={coord.lat} lng={coord.lng} onMove={(lat, lng) => setCoord({ lat, lng })} altura="h-44" />
              </div>
            )}
          </div>

          <div>
            <label className="text-gray-300 text-sm font-medium mb-2 block">Observação (opcional)</label>
            <textarea
              value={observacao}
              onChange={e => setObservacao(e.target.value)}
              rows={2}
              placeholder="Ex: sem cebola, troco pra R$ 50..."
              className="w-full bg-[#171C22] border border-[#232A32] text-white rounded-xl px-4 py-3 outline-none focus:border-[#C1441E]/60 resize-none text-sm"
            />
          </div>

          {/* Forma de pagamento */}
          <div>
            <p className="text-gray-300 text-sm font-medium mb-2">Forma de pagamento</p>
            <div className="grid grid-cols-1 gap-2">
              <button
                type="button"
                onClick={() => setPagamento('entrega')}
                className={`flex items-center gap-3 rounded-xl border p-3 text-left transition ${pagamento === 'entrega' ? 'border-[#6FD98F]/60 bg-[#6FD98F]/10' : 'border-[#232A32] bg-[#171C22] hover:border-[#2b3440]'}`}
              >
                <Banknote size={20} className="text-[#6FD98F] shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium">Pagar na entrega</p>
                  <p className="text-gray-500 text-xs">Dinheiro ou Pix direto com o entregador</p>
                </div>
                {pagamento === 'entrega' && <Check size={16} className="text-[#6FD98F] shrink-0" />}
              </button>

              {aceitaOnline ? (
                <button
                  type="button"
                  onClick={() => setPagamento('online')}
                  className={`flex items-center gap-3 rounded-xl border p-3 text-left transition ${pagamento === 'online' ? 'border-[#6FD98F]/60 bg-[#6FD98F]/10' : 'border-[#232A32] bg-[#171C22] hover:border-[#2b3440]'}`}
                >
                  <CreditCard size={20} className="text-[#6FD98F] shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium">Pagar online agora</p>
                    <p className="text-gray-500 text-xs">Cartão ou Pix (Stripe)</p>
                  </div>
                  {pagamento === 'online' && <Check size={16} className="text-[#6FD98F] shrink-0" />}
                </button>
              ) : (
                <div className="flex items-center gap-3 rounded-xl border border-[#232A32] bg-[#171C22]/50 p-3 opacity-60">
                  <CreditCard size={20} className="text-gray-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-gray-400 text-sm font-medium">Pagamento online</p>
                    <p className="text-gray-600 text-xs">Esta loja ainda não aceita cartão pelo app</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="border-t border-[#232A32] px-5 py-4 shrink-0">
          <div className="flex flex-col gap-1.5 mb-3 text-sm">
            <div className="flex items-center justify-between text-gray-400">
              <span>Subtotal <span className="text-gray-500">({totalItens} {totalItens === 1 ? 'item' : 'itens'})</span></span>
              <span className="tabular-nums">R$ {subtotal.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between text-gray-400">
              <span>
                Taxa de entrega
                {distancia != null && <span className="text-gray-500"> ({formatarDistancia(distancia)})</span>}
              </span>
              <span className="tabular-nums">
                {taxaEntrega == null
                  ? <span className="text-gray-500 text-xs">confirme o endereço</span>
                  : `R$ ${taxaEntrega.toFixed(2)}`}
              </span>
            </div>
            <div className="flex items-center justify-between border-t border-[#232A32] pt-1.5 mt-0.5">
              <span className="text-white font-medium">Total</span>
              <span className="font-display text-white font-bold text-lg tabular-nums">
                {taxaEntrega == null ? `R$ ${subtotal.toFixed(2)} + taxa` : `R$ ${total.toFixed(2)}`}
              </span>
            </div>
          </div>

          {foraDeArea && (
            <div className="mb-3 rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2.5">
              <p className="text-red-400 text-xs font-medium">
                Endereço fora da área de entrega. Esta loja entrega até {distMax} km.
              </p>
            </div>
          )}

          <button
            onClick={enviar}
            disabled={enviando || itens.length === 0 || foraDeArea}
            className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition flex items-center justify-center gap-2"
          >
            {pagamento === 'online' ? <CreditCard size={18} /> : <ShoppingBag size={18} />}
            {enviando
              ? (pagamento === 'online' ? 'Redirecionando...' : 'Enviando...')
              : (pagamento === 'online' ? 'Ir para pagamento' : 'Enviar pedido')}
          </button>
        </div>
      </div>
    </div>
  )
}
