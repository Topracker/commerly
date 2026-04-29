'use client'
import { useState, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import { AppLayout } from '../components/AppLayout'
import { Toast } from '../components/Toast'
import { Trash2 } from 'lucide-react'

type ItemCarrinho = {
  produto: any
  quantidade: number
}

export default function Vendas() {
  const { loja, loading, supabase, sair } = useAuth()
  const { toast, mostrarToast } = useToast()
  const [produtos, setProdutos] = useState<any[]>([])
  const [ultimasVendas, setUltimasVendas] = useState<any[]>([])
  const [carrinho, setCarrinho] = useState<ItemCarrinho[]>([])
  const [produtoId, setProdutoId] = useState('')
  const [quantidade, setQuantidade] = useState('1')
  const [pagamento, setPagamento] = useState('Dinheiro')
  const [confirmando, setConfirmando] = useState(false)

  useEffect(() => { if (loja) carregar() }, [loja])

  async function carregar() {
    const [prodRes, vendRes] = await Promise.all([
      supabase.from('produtos').select('*').eq('loja_id', loja.id).gt('quantidade', 0),
      supabase.from('vendas').select('*, produtos(nome)').eq('loja_id', loja.id).order('created_at', { ascending: false }).limit(20),
    ])
    if (prodRes.error) mostrarToast('Erro ao carregar produtos', 'erro')
    if (vendRes.error) mostrarToast('Erro ao carregar vendas', 'erro')
    setProdutos(prodRes.data || [])
    setUltimasVendas(vendRes.data || [])
  }

  function adicionarAoCarrinho() {
    const produto = produtos.find(p => p.id === produtoId)
    if (!produto) { mostrarToast('Selecione um produto!', 'erro'); return }
    const qtd = parseInt(quantidade) || 0
    if (qtd <= 0) { mostrarToast('Quantidade inválida!', 'erro'); return }

    const jaNoCarrinho = carrinho.find(i => i.produto.id === produto.id)
    const qtdTotal = (jaNoCarrinho?.quantidade || 0) + qtd

    if (qtdTotal > produto.quantidade) {
      mostrarToast(`Estoque insuficiente! Disponível: ${produto.quantidade}`, 'erro'); return
    }

    if (jaNoCarrinho) {
      setCarrinho(prev => prev.map(i => i.produto.id === produto.id ? { ...i, quantidade: qtdTotal } : i))
    } else {
      setCarrinho(prev => [...prev, { produto, quantidade: qtd }])
    }
    setProdutoId('')
    setQuantidade('1')
  }

  function removerDoCarrinho(id: string) {
    setCarrinho(prev => prev.filter(i => i.produto.id !== id))
  }

  const totalCarrinho = carrinho.reduce((a, i) => a + i.produto.preco_venda * i.quantidade, 0)
  const lucroCarrinho = carrinho.reduce((a, i) => a + (i.produto.preco_venda - i.produto.custo) * i.quantidade, 0)

  async function confirmarVenda() {
    if (carrinho.length === 0) { mostrarToast('Carrinho vazio!', 'erro'); return }
    setConfirmando(true)

    const inserts = carrinho.map(item => ({
      loja_id: loja.id,
      produto_id: item.produto.id,
      quantidade: item.quantidade,
      valor_total: item.produto.preco_venda * item.quantidade,
      lucro: (item.produto.preco_venda - item.produto.custo) * item.quantidade,
      forma_pagamento: pagamento,
    }))

    const { error } = await supabase.from('vendas').insert(inserts)
    if (error) { mostrarToast('Erro ao registrar venda', 'erro'); setConfirmando(false); return }

    await Promise.all(
      carrinho.map(item =>
        supabase.from('produtos').update({ quantidade: item.produto.quantidade - item.quantidade }).eq('id', item.produto.id)
      )
    )

    mostrarToast(`✓ Venda registrada! ${carrinho.length} produto(s)`, 'sucesso')
    setCarrinho([])
    setProdutoId('')
    setQuantidade('1')
    setConfirmando(false)
    carregar()
  }

  if (loading) return (
    <main className="min-h-screen bg-gray-950 flex items-center justify-center">
      <p className="text-gray-400">Carregando...</p>
    </main>
  )
  if (!loja) return null

  return (
    <AppLayout loja={loja} sair={sair} titulo="Vendas">
      <Toast toast={toast} />

      <div className="bg-gray-900 rounded-2xl p-6 mb-6">
        <h2 className="text-white font-semibold mb-4">Adicionar produto</h2>
        <div className="flex flex-col gap-4">
          <select
            value={produtoId}
            onChange={e => setProdutoId(e.target.value)}
            className="bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Selecionar produto</option>
            {produtos.map(p => (
              <option key={p.id} value={p.id}>{p.nome} — Estoque: {p.quantidade}</option>
            ))}
          </select>

          <input
            type="number"
            min="1"
            placeholder="Quantidade"
            value={quantidade}
            onChange={e => setQuantidade(e.target.value)}
            className="bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
          />

          <button
            onClick={adicionarAoCarrinho}
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition"
          >
            + Adicionar ao carrinho
          </button>
        </div>
      </div>

      {carrinho.length > 0 && (
        <div className="bg-gray-900 rounded-2xl p-6 mb-6">
          <h2 className="text-white font-semibold mb-4">Carrinho ({carrinho.length} produto{carrinho.length > 1 ? 's' : ''})</h2>

          <div className="flex flex-col gap-3 mb-4">
            {carrinho.map(item => (
              <div key={item.produto.id} className="flex items-center justify-between bg-gray-800 rounded-xl p-3">
                <div>
                  <p className="text-white font-medium text-sm">{item.produto.nome}</p>
                  <p className="text-gray-400 text-xs">{item.quantidade}x — R$ {item.produto.preco_venda.toFixed(2)} cada</p>
                </div>
                <div className="flex items-center gap-3">
                  <p className="text-white font-semibold">R$ {(item.produto.preco_venda * item.quantidade).toFixed(2)}</p>
                  <button onClick={() => removerDoCarrinho(item.produto.id)} className="text-red-400 hover:text-red-300">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-gray-800 rounded-xl p-4 mb-4 flex justify-between">
            <div>
              <p className="text-gray-400 text-sm">Total</p>
              <p className="text-white font-bold text-xl">R$ {totalCarrinho.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-gray-400 text-sm">Lucro</p>
              <p className="text-green-400 font-bold text-xl">R$ {lucroCarrinho.toFixed(2)}</p>
            </div>
          </div>

          <div className="flex gap-3 mb-4">
            {['Dinheiro', 'Pix', 'Cartão'].map(f => (
              <button key={f} onClick={() => setPagamento(f)}
                className={`flex-1 py-3 rounded-xl font-semibold transition text-sm ${pagamento === f ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
                {f}
              </button>
            ))}
          </div>

          <button
            onClick={confirmarVenda}
            disabled={confirmando}
            className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 rounded-xl transition disabled:opacity-50"
          >
            {confirmando ? 'Registrando...' : `Confirmar venda — R$ ${totalCarrinho.toFixed(2)}`}
          </button>
        </div>
      )}

      <div className="bg-gray-900 rounded-2xl p-6">
        <h2 className="text-white font-semibold mb-4">Últimas vendas</h2>
        {ultimasVendas.length === 0 ? (
          <p className="text-gray-500 text-center py-8">Nenhuma venda ainda</p>
        ) : (
          <div className="flex flex-col gap-3">
            {ultimasVendas.map(v => (
              <div key={v.id} className="flex items-center justify-between border-b border-gray-800 pb-3">
                <div>
                  <p className="text-white font-medium">{v.produtos?.nome}</p>
                  <p className="text-gray-400 text-sm">{v.quantidade}x — {v.forma_pagamento} — {new Date(v.created_at).toLocaleDateString('pt-BR')}</p>
                </div>
                <div className="text-right">
                  <p className="text-white font-semibold">R$ {v.valor_total.toFixed(2)}</p>
                  <p className="text-green-400 text-sm">+R$ {v.lucro.toFixed(2)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  )
}
