'use client'
import { useState, useEffect } from 'react'
import { createClient } from '../supabase'
import { useRouter } from 'next/navigation'

export default function Vendas() {
  const [produtos, setProdutos] = useState<any[]>([])
  const [vendas, setVendas] = useState<any[]>([])
  const [loja, setLoja] = useState<any>(null)
  const [produtoSelecionado, setProdutoSelecionado] = useState<any>(null)
  const [quantidade, setQuantidade] = useState('1')
  const [pagamento, setPagamento] = useState('Dinheiro')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => { carregar() }, [])

  async function carregar() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const { data: lojaData } = await supabase.from('lojas').select('*').eq('user_id', user.id).single()
    if (!lojaData) { router.push('/onboarding'); return }
    setLoja(lojaData)
    const { data: prodData } = await supabase.from('produtos').select('*').eq('loja_id', lojaData.id)
    setProdutos(prodData || [])
    const { data: vendaData } = await supabase.from('vendas').select('*, produtos(nome)').eq('loja_id', lojaData.id).order('created_at', { ascending: false }).limit(20)
    setVendas(vendaData || [])
  }

  const qtd = parseInt(quantidade) || 0
  const valorTotal = produtoSelecionado ? produtoSelecionado.preco_venda * qtd : 0
  const lucro = produtoSelecionado ? (produtoSelecionado.preco_venda - produtoSelecionado.custo) * qtd : 0

  async function registrarVenda() {
    if (!produtoSelecionado) return alert('Selecione um produto!')
    if (qtd <= 0) return alert('Quantidade inválida!')
    if (qtd > produtoSelecionado.quantidade) return alert('Estoque insuficiente!')
    setLoading(true)

    await supabase.from('vendas').insert({
      loja_id: loja.id,
      produto_id: produtoSelecionado.id,
      quantidade: qtd,
      valor_total: valorTotal,
      lucro,
      forma_pagamento: pagamento
    })

    await supabase.from('produtos').update({
      quantidade: produtoSelecionado.quantidade - qtd
    }).eq('id', produtoSelecionado.id)

    setProdutoSelecionado(null)
    setQuantidade('1')
    setLoading(false)
    carregar()
  }

  return (
    <main className="min-h-screen bg-gray-950 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <button onClick={() => router.push('/dashboard')} className="text-gray-400 text-sm mb-1 hover:text-white">← Dashboard</button>
          <h1 className="text-3xl font-bold text-white">Vendas</h1>
        </div>

        <div className="bg-gray-900 rounded-2xl p-6 mb-6">
          <h2 className="text-white font-semibold mb-4">Registrar venda</h2>

          <div className="flex flex-col gap-4">
            <select
              value={produtoSelecionado?.id || ''}
              onChange={e => setProdutoSelecionado(produtos.find(p => p.id === e.target.value) || null)}
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

            <div className="flex gap-3">
              {['Dinheiro', 'Pix', 'Cartão'].map(f => (
                <button
                  key={f}
                  onClick={() => setPagamento(f)}
                  className={`flex-1 py-3 rounded-xl font-semibold transition ${pagamento === f ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
                >
                  {f}
                </button>
              ))}
            </div>

            {produtoSelecionado && (
              <div className="bg-gray-800 rounded-xl p-4 flex justify-between">
                <div>
                  <p className="text-gray-400 text-sm">Total</p>
                  <p className="text-white font-bold text-xl">R$ {valorTotal.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-gray-400 text-sm">Lucro</p>
                  <p className="text-green-400 font-bold text-xl">R$ {lucro.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-gray-400 text-sm">Pagamento</p>
                  <p className="text-white font-bold text-xl">{pagamento}</p>
                </div>
              </div>
            )}

            <button
              onClick={registrarVenda}
              disabled={loading}
              className="bg-green-600 hover:bg-green-700 text-white font-semibold py-3 rounded-xl transition"
            >
              {loading ? 'Registrando...' : 'Confirmar venda'}
            </button>
          </div>
        </div>

        <div className="bg-gray-900 rounded-2xl p-6">
          <h2 className="text-white font-semibold mb-4">Últimas vendas</h2>
          {vendas.length === 0 ? (
            <p className="text-gray-500 text-center py-8">Nenhuma venda ainda</p>
          ) : (
            <div className="flex flex-col gap-3">
              {vendas.map((v, i) => (
                <div key={v.id} className="flex items-center justify-between border-b border-gray-800 pb-3">
                  <div>
                    <p className="text-white font-medium">{v.produtos?.nome}</p>
                    <p className="text-gray-400 text-sm">{v.quantidade}x — {v.forma_pagamento}</p>
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
      </div>
    </main>
  )
}