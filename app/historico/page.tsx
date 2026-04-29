'use client'
import { useState, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import { AppLayout } from '../components/AppLayout'
import { Toast } from '../components/Toast'

const POR_PAGINA = 20

export default function Historico() {
  const { loja, loading, supabase, sair } = useAuth()
  const { toast, mostrarToast } = useToast()
  const [vendas, setVendas] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [pagina, setPagina] = useState(0)
  const [temMais, setTemMais] = useState(false)
  const [periodo, setPeriodo] = useState('todos')
  const [carregando, setCarregando] = useState(false)

  useEffect(() => {
    if (loja) {
      setVendas([])
      setPagina(0)
      carregarPagina(0)
    }
  }, [loja, periodo])

  async function carregarPagina(p: number) {
    setCarregando(true)
    const agora = new Date()
    let desde = new Date()
    if (periodo === 'hoje') desde.setHours(0, 0, 0, 0)
    else if (periodo === 'semana') desde.setDate(agora.getDate() - 7)
    else if (periodo === 'mes') desde.setDate(1)

    let query = supabase
      .from('vendas')
      .select('*, produtos(nome)', { count: 'exact' })
      .eq('loja_id', loja.id)
      .order('created_at', { ascending: false })
      .range(p * POR_PAGINA, (p + 1) * POR_PAGINA - 1)

    if (periodo !== 'todos') query = query.gte('created_at', desde.toISOString())

    const { data, error, count } = await query
    if (error) { mostrarToast('Erro ao carregar histórico', 'erro'); setCarregando(false); return }

    if (p === 0) {
      setVendas(data || [])
    } else {
      setVendas(prev => [...prev, ...(data || [])])
    }

    const totalItens = count || 0
    setTotal(totalItens)
    setTemMais((p + 1) * POR_PAGINA < totalItens)
    setPagina(p)
    setCarregando(false)
  }

  function carregarMais() {
    carregarPagina(pagina + 1)
  }

  function exportarCSV() {
    const linhas = [['ID', 'Produto', 'Quantidade', 'Valor', 'Lucro', 'Pagamento', 'Data']]
    vendas.forEach((v, i) => {
      linhas.push([
        `#${String(i + 1).padStart(4, '0')}`,
        v.produtos?.nome,
        v.quantidade,
        v.valor_total.toFixed(2),
        v.lucro.toFixed(2),
        v.forma_pagamento,
        new Date(v.created_at).toLocaleDateString('pt-BR')
      ])
    })
    const csv = linhas.map(l => l.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'vendas.csv'
    a.click()
  }

  if (loading) return (
    <main className="min-h-screen bg-gray-950 flex items-center justify-center">
      <p className="text-gray-400">Carregando...</p>
    </main>
  )
  if (!loja) return null

  return (
    <AppLayout loja={loja} sair={sair} titulo="Histórico de vendas">
      <Toast toast={toast} />

      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex gap-2 flex-wrap">
          {[['hoje', 'Hoje'], ['semana', 'Semana'], ['mes', 'Mês'], ['todos', 'Todos']].map(([val, label]) => (
            <button key={val} onClick={() => setPeriodo(val)}
              className={`px-3 py-2 rounded-xl text-sm font-semibold transition ${periodo === val ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
              {label}
            </button>
          ))}
        </div>
        <button onClick={exportarCSV} className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl transition text-sm">
          Exportar CSV
        </button>
      </div>

      {vendas.length > 0 && (
        <p className="text-gray-500 text-sm mb-4">
          {vendas.length} de {total} vendas
        </p>
      )}

      {vendas.length === 0 && !carregando ? (
        <div className="text-center text-gray-500 py-20">Nenhuma venda neste período.</div>
      ) : (
        <>
          <div className="flex flex-col gap-3">
            {vendas.map((v, i) => (
              <div key={v.id} className="bg-gray-900 rounded-2xl p-4 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-gray-500 text-sm">#{String(i + 1).padStart(4, '0')}</span>
                    <p className="text-white font-semibold">{v.produtos?.nome}</p>
                  </div>
                  <p className="text-gray-400 text-sm">
                    {v.quantidade}x — {v.forma_pagamento} — {new Date(v.created_at).toLocaleDateString('pt-BR')}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-white font-semibold">R$ {v.valor_total.toFixed(2)}</p>
                  <p className="text-green-400 text-sm">+R$ {v.lucro.toFixed(2)}</p>
                </div>
              </div>
            ))}
          </div>

          {temMais && (
            <button
              onClick={carregarMais}
              disabled={carregando}
              className="w-full mt-4 bg-gray-800 hover:bg-gray-700 text-white py-3 rounded-xl transition disabled:opacity-50"
            >
              {carregando ? 'Carregando...' : 'Carregar mais'}
            </button>
          )}
        </>
      )}
    </AppLayout>
  )
}
