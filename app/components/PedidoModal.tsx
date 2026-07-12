'use client'
import { useEffect, useMemo, useState } from 'react'
import { X, Plus, Minus, ShoppingBag, MapPin, Check, CreditCard, Banknote, Sparkles } from 'lucide-react'
import type { ItemPedidoCliente } from '../lib/pedidosClientes'
import { distanciaKm, taxaEntregaPorDistancia, taxaComPico, ehHorarioPico, formatarDistancia } from '../lib/geo'
import { descontoDePontos, maxPontosResgataveis } from '../lib/fidelidade'
import { aplicarFator } from '../lib/precoDinamico'
import { MapaConfirmar } from './MapaConfirmar'

// `preco_venda` já vem com o desconto aplicado quando há promoção ativa;
// `preco_original`/`desconto_pct` existem só para exibir o "de/por".
type Produto = {
  id: string
  nome: string
  preco_venda: number | string
  categoria?: string | null
  preco_original?: number
  desconto_pct?: number
}

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

  // #6 Modo invisível: o nome e o telefone não chegam a ser gravados no pedido
  // (o guard do banco os anula). O histórico do cliente continua pelo cliente_id.
  const [anonimo, setAnonimo] = useState(false)

  // #5 Preço dinâmico: buscamos o fator vigente para exibir o preço certo.
  // Até responder, `1` (preço base) — nunca mostramos preço maior sem saber.
  const [fatorPreco, setFatorPreco] = useState(1)
  const [avisoPreco, setAvisoPreco] = useState('')

  useEffect(() => {
    let ativo = true
    fetch(`/api/loja/preco-dinamico?loja_id=${loja.id}`)
      .then(r => r.json())
      .then(d => {
        if (!ativo || typeof d.fator !== 'number') return
        setFatorPreco(d.fator)
        setAvisoPreco(d.aviso || '')
      })
      .catch(() => {})
    return () => { ativo = false }
  }, [loja.id])

  // Clube Commerly: o saldo é GLOBAL (vale em qualquer loja), então lemos a
  // view clube_saldo em vez do saldo desta loja.
  const [saldoPontos, setSaldoPontos] = useState(0)
  const [usarPontos, setUsarPontos] = useState(false)

  useEffect(() => {
    let ativo = true
    supabase
      .from('clube_saldo').select('saldo')
      .eq('cliente_id', cliente.id).maybeSingle()
      .then(({ data }: any) => { if (ativo) setSaldoPontos(Number(data?.saldo) || 0) })
    return () => { ativo = false }
  }, [cliente.id, supabase])

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
          // #5 Preço já com o fator dinâmico — é este valor que o cliente vê e
          // paga. O guard do banco recobra `least(fator_real, fator_exibido)`,
          // então nunca sai mais caro do que o mostrado aqui.
          preco: aplicarFator(parseFloat(String(p.preco_venda)) || 0, fatorPreco),
          quantidade: qtds[p.id],
        })),
    [produtos, qtds, fatorPreco],
  )

  const subtotal = useMemo(() => itens.reduce((s, i) => s + i.preco * i.quantidade, 0), [itens])
  // Taxa AUTOMÁTICA por distância loja→entrega. Só dá pra calcular depois que o
  // cliente confirma o ponto no mapa (coord). O valor definitivo é recalculado
  // no servidor (trigger) — aqui é só a prévia para o cliente ver antes.
  const distancia = coord
    ? distanciaKm({ latitude: loja.latitude, longitude: loja.longitude }, { latitude: coord.lat, longitude: coord.lng })
    : null
  // Horário de pico (sex/sáb/dom 18-22): taxa +30%. Prévia; o servidor recalcula.
  const pico = ehHorarioPico()
  const taxaEntrega = coord ? taxaComPico(taxaEntregaPorDistancia(distancia), pico) : null
  // Pontos resgatáveis dependem do subtotal atual (não descontam mais que ele).
  const pontosResgataveis = useMemo(() => maxPontosResgataveis(saldoPontos, subtotal), [saldoPontos, subtotal])
  const podeResgatar = pontosResgataveis >= 100
  const pontosUsados = usarPontos && podeResgatar ? pontosResgataveis : 0
  const desconto = descontoDePontos(pontosUsados)
  const total = Math.max(subtotal - desconto, 0) + (taxaEntrega ?? 0)
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
            pontos_resgatar: pontosUsados,
            anonimo,
            fator_exibido: fatorPreco,
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
    const { data: novoPedido, error } = await supabase.from('pedidos_clientes').insert({
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
      // O guard do banco é quem anula nome/telefone quando anonimo=true — não
      // depende deste cliente enviar null.
      anonimo,
      // Teto de preço: o guard cobra o menor entre o fator real e este.
      fator_exibido: fatorPreco,
      // Resgate de pontos: o guard valida contra o saldo, calcula o desconto e
      // ajusta o total no servidor (aqui é só a intenção do cliente).
      pontos_usados: pontosUsados,
      // pagamento_metodo default 'entrega' no banco — omitido para não quebrar
      // caso a coluna ainda não exista (pré-migração).
    }).select('id').single()
    if (error) {
      onErro(error.message?.includes('Delivery indisponível')
        ? 'Delivery indisponível na sua cidade no momento. 💛'
        : 'Não foi possível enviar o pedido. Tente novamente.')
      setEnviando(false); return
    }

    // Push nativo para o comerciante (o trigger já gravou a notificação in-app).
    // Best-effort: não bloqueia nem quebra o fluxo se falhar.
    if (novoPedido?.id) {
      fetch('/api/push/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pedido_id: novoPedido.id }),
      }).catch(() => {})
    }

    setEnviando(false)
    onSucesso('Pedido enviado! Acompanhe em "Meus pedidos".')
    onFechar()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onFechar} />
      <div className="relative z-10 w-full sm:max-w-lg bg-card border border-borda sm:rounded-2xl rounded-t-2xl max-h-[92vh] flex flex-col font-body">
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-borda shrink-0">
          <div className="min-w-0">
            <h2 className="font-display text-white font-bold text-lg truncate">Fazer pedido</h2>
            <p className="text-gray-500 text-xs truncate">{loja.nome}</p>
          </div>
          <button onClick={onFechar} className="shrink-0 text-gray-400 hover:text-white"><X size={22} /></button>
        </div>

        <div className="overflow-y-auto px-5 py-4 flex flex-col gap-4 min-h-0">
          {/* #5 Aviso de preço dinâmico — antes da lista, não depois do total. */}
          {avisoPreco && (
            <div className="rounded-xl border border-orange-500/30 bg-orange-500/10 px-3 py-2.5">
              <p className="text-sm font-medium text-orange-300">{avisoPreco}</p>
              <p className="mt-0.5 text-xs text-orange-300/70">
                Os preços abaixo já incluem o ajuste. O valor não muda depois que você confirmar.
              </p>
            </div>
          )}

          <div>
            <p className="text-gray-300 text-sm font-medium mb-2">Produtos</p>
            <div className="flex flex-col gap-2">
              {produtos.map(p => {
                const q = qtds[p.id] || 0
                const precoBase = parseFloat(String(p.preco_venda)) || 0
                const preco = aplicarFator(precoBase, fatorPreco)
                return (
                  <div key={p.id} className={`flex items-center gap-3 rounded-xl border p-2.5 transition ${q > 0 ? 'border-acento/60 bg-elevado' : 'border-borda bg-superficie'}`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-white text-sm font-medium truncate">{p.nome}</p>
                        {p.desconto_pct != null && (
                          <span className="shrink-0 text-[10px] font-bold bg-acento/20 text-acento px-1.5 py-0.5 rounded">
                            -{p.desconto_pct}%
                          </span>
                        )}
                      </div>
                      <p className="font-display font-bold text-sm">
                        {p.preco_original != null && (
                          <span className="text-gray-500 line-through mr-1.5 font-normal">R$ {p.preco_original.toFixed(2)}</span>
                        )}
                        <span className="text-acento">R$ {preco.toFixed(2)}</span>
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => mudarQtd(p.id, -1)}
                        disabled={q === 0}
                        aria-label="Diminuir"
                        className="w-8 h-8 flex items-center justify-center rounded-lg bg-borda text-white disabled:opacity-30 hover:bg-[#2c343d] transition"
                      >
                        <Minus size={16} />
                      </button>
                      <span className="w-6 text-center text-white font-semibold tabular-nums">{q}</span>
                      <button
                        onClick={() => mudarQtd(p.id, 1)}
                        aria-label="Aumentar"
                        className="w-8 h-8 flex items-center justify-center rounded-lg bg-acento text-white hover:bg-acento-forte transition"
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
                className="w-full bg-superficie border border-borda text-white rounded-xl px-4 py-3 pr-24 outline-none focus:border-acento/60 text-sm"
              />
              {buscandoSug && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs">buscando...</span>
              )}
            </div>

            {/* Sugestões (in-flow pra não serem cortadas pelo scroll do modal). */}
            {sugestoes.length > 0 && (
              <ul className="mt-1.5 flex flex-col gap-0.5 rounded-xl border border-borda bg-superficie p-1">
                {sugestoes.map((s, i) => (
                  <li key={`${s.lat},${s.lng},${i}`}>
                    <button
                      type="button"
                      onClick={() => selecionarSugestao(s)}
                      className="w-full text-left px-3 py-2 rounded-lg text-gray-300 text-sm hover:bg-borda transition flex items-start gap-2"
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
              className="w-full bg-superficie border border-borda text-white rounded-xl px-4 py-3 outline-none focus:border-acento/60 resize-none text-sm"
            />
          </div>

          {/* #6 Modo invisível */}
          <button
            type="button"
            onClick={() => setAnonimo(v => !v)}
            className={`w-full rounded-xl border p-3 text-left transition ${
              anonimo ? 'border-acento/60 bg-acento/10' : 'border-borda bg-superficie hover:border-borda/80'
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-white">🕵️ Pedir anonimamente</span>
              <span
                className={`flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition ${anonimo ? 'bg-acento' : 'bg-gray-700'}`}
              >
                <span className={`h-4 w-4 rounded-full bg-white transition ${anonimo ? 'translate-x-4' : ''}`} />
              </span>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-gray-400">
              {anonimo
                ? 'A loja e o entregador verão só o endereço de entrega. Seu histórico e seus pontos continuam normais.'
                : 'A loja verá seu nome e telefone.'}
            </p>
          </button>

          {/* Fidelidade — resgate de pontos (só aparece com saldo suficiente) */}
          {podeResgatar && (
            <button
              type="button"
              onClick={() => setUsarPontos(v => !v)}
              className={`flex items-center gap-3 rounded-xl border p-3 text-left transition ${usarPontos ? 'border-[#F5C34B]/60 bg-[#F5C34B]/10' : 'border-borda bg-superficie hover:border-[#2b3440]'}`}
            >
              <Sparkles size={20} className="text-[#F5C34B] shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-medium">Usar meus pontos</p>
                <p className="text-gray-500 text-xs">
                  {saldoPontos} pontos disponíveis · resgatar {pontosResgataveis} = R$ {descontoDePontos(pontosResgataveis).toFixed(2)} de desconto
                </p>
              </div>
              {usarPontos && <Check size={16} className="text-[#F5C34B] shrink-0" />}
            </button>
          )}

          {/* Forma de pagamento */}
          <div>
            <p className="text-gray-300 text-sm font-medium mb-2">Forma de pagamento</p>
            <div className="grid grid-cols-1 gap-2">
              <button
                type="button"
                onClick={() => setPagamento('entrega')}
                className={`flex items-center gap-3 rounded-xl border p-3 text-left transition ${pagamento === 'entrega' ? 'border-acento/60 bg-acento/10' : 'border-borda bg-superficie hover:border-[#2b3440]'}`}
              >
                <Banknote size={20} className="text-acento shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium">Pagar na entrega</p>
                  <p className="text-gray-500 text-xs">Dinheiro ou Pix direto com o entregador</p>
                </div>
                {pagamento === 'entrega' && <Check size={16} className="text-acento shrink-0" />}
              </button>

              {aceitaOnline ? (
                <button
                  type="button"
                  onClick={() => setPagamento('online')}
                  className={`flex items-center gap-3 rounded-xl border p-3 text-left transition ${pagamento === 'online' ? 'border-acento/60 bg-acento/10' : 'border-borda bg-superficie hover:border-[#2b3440]'}`}
                >
                  <CreditCard size={20} className="text-acento shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium">Pagar online agora</p>
                    <p className="text-gray-500 text-xs">Cartão ou Pix (Stripe)</p>
                  </div>
                  {pagamento === 'online' && <Check size={16} className="text-acento shrink-0" />}
                </button>
              ) : (
                <div className="flex items-center gap-3 rounded-xl border border-borda bg-superficie/50 p-3 opacity-60">
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

        <div className="border-t border-borda px-5 py-4 shrink-0">
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
            {pico && (
              <div className="flex items-center gap-1.5 text-acento text-xs -mt-0.5">
                <span>🔥 Horário de pico — taxa de entrega aumentada</span>
              </div>
            )}
            {desconto > 0 && (
              <div className="flex items-center justify-between text-[#F5C34B]">
                <span className="flex items-center gap-1.5"><Sparkles size={13} /> Desconto ({pontosUsados} pontos)</span>
                <span className="tabular-nums">− R$ {desconto.toFixed(2)}</span>
              </div>
            )}
            <div className="flex items-center justify-between border-t border-borda pt-1.5 mt-0.5">
              <span className="text-white font-medium">Total</span>
              <span className="font-display text-white font-bold text-lg tabular-nums">
                {taxaEntrega == null ? `R$ ${Math.max(subtotal - desconto, 0).toFixed(2)} + taxa` : `R$ ${total.toFixed(2)}`}
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
