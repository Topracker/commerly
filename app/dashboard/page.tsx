'use client'
import { useEffect, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import { AppLayout } from '../components/AppLayout'
import { Toast } from '../components/Toast'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'

type GraficoDia = { dia: string; faturamento: number }

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
  const [mpConectado, setMpConectado] = useState(false)
  const [graficoData, setGraficoData] = useState<GraficoDia[]>([])

  useEffect(() => {
    if (loja) {
      carregarDados()
      supabase
        .from('mercadopago_conexoes')
        .select('id')
        .eq('loja_id', loja.id)
        .maybeSingle()
        .then(({ data }) => setMpConectado(!!data))
    }
  }, [loja, periodo])

  async function carregarDados() {
    setCarregando(true)
    const agora = new Date()
    let desde = new Date()
    if (periodo === 'hoje') desde.setHours(0, 0, 0, 0)
    else if (periodo === 'semana') desde.setDate(agora.getDate() - 7)
    else desde.setDate(1)

    const seteAtras = new Date()
    seteAtras.setDate(agora.getDate() - 6)
    seteAtras.setHours(0, 0, 0, 0)

    const [vendasRes, gastosRes, produtosRes, recentesRes, fiadoRes, vendasSemanaRes] = await Promise.all([
      supabase.from('vendas').select('*, produtos(nome)').eq('loja_id', loja.id).gte('created_at', desde.toISOString()),
      supabase.from('gastos').select('*').eq('loja_id', loja.id).gte('created_at', desde.toISOString()),
      supabase.from('produtos').select('*').eq('loja_id', loja.id),
      supabase.from('vendas').select('*, produtos(nome)').eq('loja_id', loja.id).order('created_at', { ascending: false }).limit(5),
      supabase.from('fiado').select('*').eq('loja_id', loja.id).eq('pago', false),
      supabase.from('vendas').select('valor_total, created_at').eq('loja_id', loja.id).gte('created_at', seteAtras.toISOString()),
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

    // Monta array dos últimos 7 dias para o gráfico
    const diasMap: Record<string, GraficoDia> = {}
    for (let i = 6; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const isoKey = d.toISOString().slice(0, 10)
      const label = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
      diasMap[isoKey] = { dia: label, faturamento: 0 }
    }
    for (const v of (vendasSemanaRes.data || [])) {
      const isoKey = (v.created_at as string).slice(0, 10)
      if (diasMap[isoKey]) diasMap[isoKey].faturamento += v.valor_total
    }
    setGraficoData(Object.values(diasMap))

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
          {/* Gráfico de faturamento — sempre últimos 7 dias */}
          <div className="bg-gray-900 rounded-2xl p-5 mb-6">
            <p className="text-white font-semibold mb-4">Faturamento — últimos 7 dias</p>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={graficoData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
                <XAxis dataKey="dia" tick={{ fill: '#9ca3af', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} axisLine={false} tickLine={false}
                  tickFormatter={(v) => `R$${v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v}`} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: 8 }}
                  labelStyle={{ color: '#e5e7eb', fontSize: 12 }}
                  formatter={(value) => [`R$ ${Number(value).toFixed(2)}`, 'Faturamento']}
                  cursor={{ fill: '#1f2937' }}
                />
                <Bar dataKey="faturamento" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

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

          {mpConectado && (
            <div
              className="flex items-center gap-3 bg-blue-950 border border-blue-800 rounded-2xl p-4 mb-3 cursor-pointer hover:bg-blue-900 transition"
              onClick={() => window.location.href = '/configuracoes'}
            >
              <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold text-xs flex-shrink-0">MP</div>
              <div>
                <p className="text-blue-200 font-semibold text-sm">Maquininha conectada</p>
                <p className="text-blue-400 text-xs">Pagamentos registrados automaticamente</p>
              </div>
              <span className="ml-auto w-2 h-2 rounded-full bg-green-400" />
            </div>
          )}

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
                      <p className="text-white text-sm">{v.produtos?.nome || v.descricao || '—'}</p>
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
