'use client'
import { useState, useEffect } from 'react'
import { createClient } from '../supabase'
import { useRouter } from 'next/navigation'

const tipos = ['Aluguel', 'Conta de luz', 'Conta de água', 'Internet', 'Compras', 'Salário', 'Outro']

export default function Gastos() {
  const [gastos, setGastos] = useState<any[]>([])
  const [loja, setLoja] = useState<any>(null)
  const [modal, setModal] = useState(false)
  const [descricao, setDescricao] = useState('')
  const [valor, setValor] = useState('')
  const [tipo, setTipo] = useState('')
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
    const { data } = await supabase.from('gastos').select('*').eq('loja_id', lojaData.id).order('created_at', { ascending: false })
    setGastos(data || [])
  }

  async function salvar() {
    if (!descricao || !valor || !tipo) return alert('Preencha todos os campos!')
    setLoading(true)
    await supabase.from('gastos').insert({
      loja_id: loja.id,
      descricao,
      valor: parseFloat(valor),
      tipo
    })
    setModal(false)
    setDescricao(''); setValor(''); setTipo('')
    setLoading(false)
    carregar()
  }

  async function remover(id: string) {
    if (!confirm('Remover gasto?')) return
    await supabase.from('gastos').delete().eq('id', id)
    carregar()
  }

  const total = gastos.reduce((a, g) => a + g.valor, 0)

  return (
    <main className="min-h-screen bg-gray-950 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <button onClick={() => router.push('/dashboard')} className="text-gray-400 text-sm mb-1 hover:text-white">← Dashboard</button>
            <h1 className="text-3xl font-bold text-white">Gastos</h1>
          </div>
          <button onClick={() => setModal(true)} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl transition">
            + Adicionar
          </button>
        </div>

        <div className="bg-gray-900 rounded-2xl p-6 mb-6">
          <p className="text-gray-400 text-sm mb-1">Total de gastos</p>
          <p className="text-3xl font-bold text-red-400">R$ {total.toFixed(2)}</p>
        </div>

        {gastos.length === 0 ? (
          <div className="text-center text-gray-500 py-20">Nenhum gasto cadastrado ainda.</div>
        ) : (
          <div className="flex flex-col gap-3">
            {gastos.map(g => (
              <div key={g.id} className="bg-gray-900 rounded-2xl p-4 flex items-center justify-between">
                <div>
                  <p className="text-white font-semibold">{g.descricao}</p>
                  <p className="text-gray-400 text-sm">{g.tipo}</p>
                </div>
                <div className="flex items-center gap-3">
                  <p className="text-red-400 font-semibold">R$ {g.valor.toFixed(2)}</p>
                  <button onClick={() => remover(g.id)} className="bg-red-900 hover:bg-red-800 text-red-300 px-3 py-1.5 rounded-lg text-sm transition">Remover</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center p-6 z-50">
          <div className="bg-gray-900 rounded-3xl p-8 w-full max-w-md">
            <h2 className="text-xl font-bold text-white mb-6">Novo gasto</h2>
            <div className="flex flex-col gap-4">
              <input
                placeholder="Descrição *"
                value={descricao}
                onChange={e => setDescricao(e.target.value)}
                className="bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
              />
              <select
                value={tipo}
                onChange={e => setTipo(e.target.value)}
                className="bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Tipo de gasto *</option>
                {tipos.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <input
                placeholder="Valor *"
                type="number"
                value={valor}
                onChange={e => setValor(e.target.value)}
                className="bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
              />
              <div className="flex gap-3 mt-2">
                <button onClick={() => setModal(false)} className="flex-1 bg-gray-800 hover:bg-gray-700 text-white py-3 rounded-xl transition">Cancelar</button>
                <button onClick={salvar} disabled={loading} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition">
                  {loading ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}