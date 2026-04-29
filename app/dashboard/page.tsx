'use client'
import { useEffect, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import { AppLayout } from '../components/AppLayout'
import { Toast } from '../components/Toast'

export default function Dashboard() {
  const { loja, loading, supabase, sair } = useAuth()
  const { toast, mostrarToast } = useToast()
  const [faturamento, setFaturamento] = useState(0)
  const [lucro, setLucro] = useState(0)
  const [gastos, setGastos] = useState(0)
  const [estoqueBaixo, setEstoqueBaixo] = useState<any[]>([])
  const [ultimasVendas, setUltimasVendas] = useState<any[]>([])
  const [topProdutos, setTopProdutos] = useState<any[]>([])
  const [totalFiado, setTotalFiado] = useState(0)
  const [periodo, setPeriodo] = useState('mes')
  const [carregando, setCarregando] = useState(false)

  useEffect(() => {
    if (loja) carregarDados()
  }, [loja, periodo])

  async function carregarDados() {
    setCarregando(true)
    const agora = new Date()
    let desde = new Date()
    if (periodo === 'hoje') desde.setHours(0, 0, 0, 0)
    else if (periodo === 'semana') desde.setDate(agora.getDate() - 7)
    else desde.setDate(1)

    const [vendasRes, gastosRes, produtosRes, recentesRes, fiadoRes] = await Promise.all([
      supabase.from('vendas').select('*, produtos(nome)').eq('loja_id', loja.id).gte('created_at', desde.toISOString()),
      supabase.from('gastos').select('*').eq('loja_id', loja.id).gte('created_at', desde.toISOString()),
      supabase.from('produtos').select('*').eq('loja_id', loja.id),
      supabase.from('vendas').select('*, produtos(nome)').eq('loja_id', loja.id).order('created_at', { ascending: false }).limit(5),
      supabase.from('fiado').select('*').eq('loja_id', loja.id).eq('pago', false),
    ])

    if (vendasRes.error) { mostrarToast('Erro ao carregar vendas', 'erro') }
    if (gastosRes.error) { mostrarToast('Erro ao carregar gastos', 'erro') }

    const vendas = vendasRes.data || []
    const gastosData = gastosRes.data || []

    setFaturamento(vendas.reduce((a: number, v: any) => a + v.valor_total, 0))
    setLucro(vendas.reduce((a: number, v: any) => a + v.lucro, 0))
    setGastos(gastosData.reduce((a: number, g: any) => a + g.valor, 0))

    const topMap: any = {}
    vendas.forEach((v: any) => {
      const nome = v.produtos?.nome || 'Desconhecido'
      if (!topMap[nome]) topMap[nome] = { nome, quantidade: 0, lucro: 0 }
      topMap[nome].quantidade += v.quantidade
      topMap[nome].lucro += v.lucro
    })
    setTopProdutos(Object.values(topMap).sort((a: any, b: any) => b.quantidade - a.quantidade).slice(0, 3))

    setEstoqueBaixo((produtosRes.data || []).filter((p: any) => p.quantidade <= p.quantidade_minima))
    setUltimasVendas(recentesRes.data || [])
    setTotalFiado((fiadoRes.data || []).reduce((a: number, f: any) => a + f.valor, 0))
    setCarregando(false)
  }

  if (loading) return (
    <main className="min-h-screen bg-gray-950 flex items-center justify-center">
      <p className="text-gray-400">Carregando...</p>
    </main>
  )
  if (!loja) return null

  const resultadoLiquido = lucro - gastos

  return (
    <AppLayout loja={loja} sair={sair} titulo="Dashboard" maxWidth="max-w-3xl">
      <Toast toast={toast} />

      <div className="flex gap-2 mb-6">
        {[['hoje', 'Hoje'], ['semana', 'Semana'], ['mes', 'Mês']].map(([val, label]) => (
          <button key={val} onClick={() => setPeriodo(val)}
            className={`px-3 py-2 rounded-xl text-sm font-semibold transition ${periodo === val ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
            {label}
          </button>
        ))}
      </div>

      {carregando ? (
        <div className="text-center py-12 text-gray-500">Atualizando...</div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="bg-gray-900 rounded-2xl p-4">
              <p className="text-gray-400 text-xs mb-1">Faturamento</p>
              <p className="text-lg font-bold text-white">R$ {faturamento.toFixed(2)}</p>
            </div>
            <div className="bg-gray-900 rounded-2xl p-4">
              <p className="text-gray-400 text-xs mb-1">Lucro bruto</p>
              <p className="text-lg font-bold text-green-400">R$ {lucro.toFixed(2)}</p>
            </div>
            <div className="bg-gray-900 rounded-2xl p-4">
              <p className="text-gray-400 text-xs mb-1">Gastos</p>
              <p className="text-lg font-bold text-red-400">R$ {gastos.toFixed(2)}</p>
            </div>
            <div className="bg-gray-900 rounded-2xl p-4 cursor-pointer hover:bg-gray-800 transition"
              onClick={() => window.location.href = '/fiado'}>
              <p className="text-gray-400 text-xs mb-1">Fiado pendente</p>
              <p className="text-lg font-bold text-yellow-400">R$ {totalFiado.toFixed(2)}</p>
            </div>
          </div>

          <div className={`rounded-2xl p-4 mb-6 ${resultadoLiquido >= 0 ? 'bg-green-950 border border-green-800' : 'bg-red-950 border border-red-800'}`}>
            <p className="text-gray-300 text-xs mb-1">Resultado líquido (lucro - gastos)</p>
            <p className={`text-2xl font-bold ${resultadoLiquido >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {resultadoLiquido >= 0 ? '+' : ''}R$ {resultadoLiquido.toFixed(2)}
            </p>
          </div>

          {estoqueBaixo.length > 0 && (
            <div className="bg-red-950 border border-red-800 rounded-2xl p-4 mb-6">
              <p className="text-red-300 font-semibold mb-2">⚠️ Estoque baixo</p>
              {estoqueBaixo.map(p => (
                <p key={p.id} className="text-red-400 text-sm">{p.nome} — {p.quantidade} unidades</p>
              ))}
            </div>
          )}

          {topProdutos.length > 0 && (
            <div className="bg-gray-900 rounded-2xl p-5 mb-6">
              <h2 className="text-white font-semibold mb-4">Top produtos</h2>
              <div className="flex flex-col gap-3">
                {topProdutos.map((p, i) => (
                  <div key={p.nome} className="flex justify-between items-center">
                    <div className="flex items-center gap-3">
                      <span className="text-gray-500 text-sm">#{i + 1}</span>
                      <p className="text-white text-sm">{p.nome}</p>
                    </div>
                    <div className="flex gap-3">
                      <p className="text-blue-400 text-sm">{p.quantidade}x</p>
                      <p className="text-green-400 text-sm">R$ {p.lucro.toFixed(2)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {ultimasVendas.length > 0 && (
            <div className="bg-gray-900 rounded-2xl p-5">
              <h2 className="text-white font-semibold mb-4">Últimas vendas</h2>
              <div className="flex flex-col gap-3">
                {ultimasVendas.map(v => (
                  <div key={v.id} className="flex justify-between border-b border-gray-800 pb-3">
                    <div>
                      <p className="text-white text-sm">{v.produtos?.nome}</p>
                      <p className="text-gray-400 text-xs">{v.quantidade}x — {v.forma_pagamento}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-white text-sm">R$ {v.valor_total.toFixed(2)}</p>
                      <p className="text-green-400 text-xs">+R$ {v.lucro.toFixed(2)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </AppLayout>
  )
}
