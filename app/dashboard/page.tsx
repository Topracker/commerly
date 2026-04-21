'use client'
import { useEffect, useState } from 'react'
import { createClient } from '../supabase'
import { useRouter } from 'next/navigation'
import { Package, ShoppingCart, TrendingDown, Clock, Users, MessageSquare, Settings, LogOut } from 'lucide-react'

export default function Dashboard() {
  const [loja, setLoja] = useState<any>(null)
  const [faturamento, setFaturamento] = useState(0)
  const [lucro, setLucro] = useState(0)
  const [gastos, setGastos] = useState(0)
  const [estoqueBaixo, setEstoqueBaixo] = useState<any[]>([])
  const [ultimasVendas, setUltimasVendas] = useState<any[]>([])
  const [topProdutos, setTopProdutos] = useState<any[]>([])
  const [periodo, setPeriodo] = useState('mes')
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => { carregar() }, [periodo])

  async function carregar() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const { data: lojaData } = await supabase.from('lojas').select('*').eq('user_id', user.id).single()
    if (!lojaData) { router.push('/onboarding'); return }
    setLoja(lojaData)

    const agora = new Date()
    let desde = new Date()
    if (periodo === 'hoje') desde.setHours(0,0,0,0)
    else if (periodo === 'semana') desde.setDate(agora.getDate() - 7)
    else desde.setDate(1)

    const { data: vendas } = await supabase.from('vendas').select('*, produtos(nome)').eq('loja_id', lojaData.id).gte('created_at', desde.toISOString())
    setFaturamento(vendas?.reduce((a, v) => a + v.valor_total, 0) || 0)
    setLucro(vendas?.reduce((a, v) => a + v.lucro, 0) || 0)

    const topMap: any = {}
    vendas?.forEach(v => {
      const nome = v.produtos?.nome || 'Desconhecido'
      if (!topMap[nome]) topMap[nome] = { nome, quantidade: 0, lucro: 0 }
      topMap[nome].quantidade += v.quantidade
      topMap[nome].lucro += v.lucro
    })
    setTopProdutos(Object.values(topMap).sort((a: any, b: any) => b.quantidade - a.quantidade).slice(0, 3))

    const { data: gastosData } = await supabase.from('gastos').select('*').eq('loja_id', lojaData.id).gte('created_at', desde.toISOString())
    setGastos(gastosData?.reduce((a, g) => a + g.valor, 0) || 0)

    const { data: produtos } = await supabase.from('produtos').select('*').eq('loja_id', lojaData.id)
    setEstoqueBaixo(produtos?.filter(p => p.quantidade <= p.quantidade_minima) || [])

    const { data: recentes } = await supabase.from('vendas').select('*, produtos(nome)').eq('loja_id', lojaData.id).order('created_at', { ascending: false }).limit(5)
    setUltimasVendas(recentes || [])

    setLoading(false)
  }

  async function sair() {
    await supabase.auth.signOut()
    router.push('/')
  }

  if (loading) return (
    <main className="min-h-screen bg-gray-950 flex items-center justify-center">
      <p className="text-gray-400">Carregando...</p>
    </main>
  )

  const menuItems = [
    { label: 'Produtos', sub: 'Gerenciar estoque', path: '/produtos', icon: Package },
    { label: 'Vendas', sub: 'Registrar vendas', path: '/vendas', icon: ShoppingCart },
    { label: 'Gastos', sub: 'Controlar despesas', path: '/gastos', icon: TrendingDown },
    { label: 'Histórico', sub: 'Ver todas as vendas', path: '/historico', icon: Clock },
    { label: 'Funcionários', sub: 'Gerenciar equipe', path: '/funcionarios', icon: Users },
    { label: 'Feedback', sub: 'Enviar sugestão', path: '/feedback', icon: MessageSquare },
    { label: 'Configurações', sub: 'Editar dados da loja', path: '/configuracoes', icon: Settings },
  ]

  return (
    <div className="min-h-screen bg-gray-950 flex">
      <aside className="w-56 bg-gray-900 flex flex-col p-4 gap-1 fixed h-full">
        <div className="mb-4 px-2">
          <p className="text-white font-bold text-lg">{loja.nome}</p>
          <p className="text-gray-400 text-xs">{loja.tipo}</p>
        </div>
        {menuItems.map(item => (
          <button key={item.path} onClick={() => router.push(item.path)}
            className="text-left px-3 py-2.5 rounded-xl hover:bg-gray-800 transition flex items-center gap-3">
            <item.icon size={16} className="text-gray-400 shrink-0" />
            <div>
              <p className="text-white text-sm font-medium">{item.label}</p>
              <p className="text-gray-500 text-xs">{item.sub}</p>
            </div>
          </button>
        ))}
        <div className="mt-auto">
          <button onClick={sair} className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-gray-800 transition flex items-center gap-3 text-gray-400 text-sm">
            <LogOut size={16} />
            Sair
          </button>
        </div>
      </aside>

      <main className="ml-56 flex-1 p-6">
        <div className="max-w-3xl mx-auto">
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-white">Dashboard</h1>
          </div>

          <div className="flex gap-2 mb-6">
            {[['hoje','Hoje'],['semana','Semana'],['mes','Mês']].map(([val, label]) => (
              <button key={val} onClick={() => setPeriodo(val)}
                className={`px-4 py-2 rounded-xl text-sm font-semibold transition ${periodo === val ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
                {label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-gray-900 rounded-2xl p-6">
              <p className="text-gray-400 text-sm mb-1">Faturamento</p>
              <p className="text-2xl font-bold text-white">R$ {faturamento.toFixed(2)}</p>
            </div>
            <div className="bg-gray-900 rounded-2xl p-6">
              <p className="text-gray-400 text-sm mb-1">Lucro</p>
              <p className="text-2xl font-bold text-green-400">R$ {lucro.toFixed(2)}</p>
            </div>
            <div className="bg-gray-900 rounded-2xl p-6">
              <p className="text-gray-400 text-sm mb-1">Gastos</p>
              <p className="text-2xl font-bold text-red-400">R$ {gastos.toFixed(2)}</p>
            </div>
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
            <div className="bg-gray-900 rounded-2xl p-6 mb-6">
              <h2 className="text-white font-semibold mb-4">Top produtos</h2>
              <div className="flex flex-col gap-3">
                {topProdutos.map((p, i) => (
                  <div key={p.nome} className="flex justify-between items-center">
                    <div className="flex items-center gap-3">
                      <span className="text-gray-500 text-sm w-5">#{i+1}</span>
                      <p className="text-white">{p.nome}</p>
                    </div>
                    <div className="flex gap-4">
                      <p className="text-blue-400 text-sm">{p.quantidade}x vendido</p>
                      <p className="text-green-400 text-sm">R$ {p.lucro.toFixed(2)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {ultimasVendas.length > 0 && (
            <div className="bg-gray-900 rounded-2xl p-6">
              <h2 className="text-white font-semibold mb-4">Últimas vendas</h2>
              <div className="flex flex-col gap-3">
                {ultimasVendas.map(v => (
                  <div key={v.id} className="flex justify-between border-b border-gray-800 pb-3">
                    <div>
                      <p className="text-white">{v.produtos?.nome}</p>
                      <p className="text-gray-400 text-sm">{v.quantidade}x — {v.forma_pagamento}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-white">R$ {v.valor_total.toFixed(2)}</p>
                      <p className="text-green-400 text-sm">+R$ {v.lucro.toFixed(2)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}