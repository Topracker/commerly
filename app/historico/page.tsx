'use client'
import { useState, useEffect } from 'react'
import { createClient } from '../supabase'
import { useRouter } from 'next/navigation'

export default function Historico() {
  const [vendas, setVendas] = useState<any[]>([])
  const [loja, setLoja] = useState<any>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => { carregar() }, [])

  async function carregar() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const { data: lojaData } = await supabase.from('lojas').select('*').eq('user_id', user.id).single()
    if (!lojaData) { router.push('/onboarding'); return }
    setLoja(lojaData)
    const { data } = await supabase.from('vendas').select('*, produtos(nome)').eq('loja_id', lojaData.id).order('created_at', { ascending: false })
    setVendas(data || [])
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

  return (
    <main className="min-h-screen bg-gray-950 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <button onClick={() => router.push('/dashboard')} className="text-gray-400 text-sm mb-1 hover:text-white">← Dashboard</button>
            <h1 className="text-3xl font-bold text-white">Histórico de vendas</h1>
          </div>
          <button onClick={exportarCSV} className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl transition">
            Exportar CSV
          </button>
        </div>

        {vendas.length === 0 ? (
          <div className="text-center text-gray-500 py-20">Nenhuma venda ainda.</div>
        ) : (
          <div className="flex flex-col gap-3">
            {vendas.map((v, i) => (
              <div key={v.id} className="bg-gray-900 rounded-2xl p-4 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-gray-500 text-sm">#{String(vendas.length - i).padStart(4, '0')}</span>
                    <p className="text-white font-semibold">{v.produtos?.nome}</p>
                  </div>
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
    </main>
  )
}