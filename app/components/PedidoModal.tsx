'use client'
import { useMemo, useState } from 'react'
import { X, Plus, Minus, ShoppingBag, MapPin } from 'lucide-react'
import type { ItemPedidoCliente } from '../lib/pedidosClientes'

type Produto = { id: string; nome: string; preco_venda: number | string; categoria?: string | null }

type Props = {
  loja: { id: string; nome: string }
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

  const total = useMemo(() => itens.reduce((s, i) => s + i.preco * i.quantidade, 0), [itens])
  const totalItens = itens.reduce((s, i) => s + i.quantidade, 0)

  async function enviar() {
    if (itens.length === 0) { onErro('Escolha pelo menos um produto.'); return }
    if (!endereco.trim()) { onErro('Informe o endereço de entrega.'); return }
    setEnviando(true)
    const { error } = await supabase.from('pedidos_clientes').insert({
      loja_id: loja.id,
      cliente_id: cliente.id,
      itens,
      total,
      endereco_entrega: endereco.trim(),
      observacao: observacao.trim() || null,
      cliente_nome: cliente.nome || null,
      cliente_telefone: cliente.telefone || null,
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
            <textarea
              value={endereco}
              onChange={e => setEndereco(e.target.value)}
              rows={2}
              placeholder="Rua, número, bairro, complemento..."
              className="w-full bg-[#171C22] border border-[#232A32] text-white rounded-xl px-4 py-3 outline-none focus:border-[#C1441E]/60 resize-none text-sm"
            />
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
        </div>

        <div className="border-t border-[#232A32] px-5 py-4 shrink-0">
          <div className="flex items-center justify-between mb-3">
            <span className="text-gray-400 text-sm">{totalItens} {totalItens === 1 ? 'item' : 'itens'}</span>
            <span className="font-display text-white font-bold text-lg">R$ {total.toFixed(2)}</span>
          </div>
          <button
            onClick={enviar}
            disabled={enviando || itens.length === 0}
            className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition flex items-center justify-center gap-2"
          >
            <ShoppingBag size={18} />
            {enviando ? 'Enviando...' : 'Enviar pedido'}
          </button>
        </div>
      </div>
    </div>
  )
}
