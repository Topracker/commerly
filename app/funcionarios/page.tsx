'use client'
import { useState, useEffect } from 'react'
import { createClient } from '../supabase'
import { useRouter } from 'next/navigation'

export default function Funcionarios() {
  const [loja, setLoja] = useState<any>(null)
  const [funcionarios, setFuncionarios] = useState<any[]>([])
  const [modal, setModal] = useState(false)
  const [nome, setNome] = useState('')
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
    const { data } = await supabase.from('funcionarios').select('*').eq('loja_id', lojaData.id).order('created_at', { ascending: false })
    setFuncionarios(data || [])
  }

  async function salvar() {
    if (!nome) return alert('Digite o nome!')
    setLoading(true)
    await supabase.from('funcionarios').insert({ loja_id: loja.id, nome })
    setNome('')
    setModal(false)
    setLoading(false)
    carregar()
  }

  async function remover(id: string) {
    if (!confirm('Remover funcionário?')) return
    await supabase.from('funcionarios').delete().eq('id', id)
    carregar()
  }

  return (
    <main className="min-h-screen bg-gray-950 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <button onClick={() => router.push('/dashboard')} className="text-gray-400 text-sm mb-1 hover:text-white">← Dashboard</button>
            <h1 className="text-3xl font-bold text-white">Funcionários</h1>
            <p className="text-gray-400 text-sm mt-1">Total: {funcionarios.length}</p>
          </div>
          <button onClick={() => setModal(true)} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl transition">
            + Adicionar
          </button>
        </div>

        {funcionarios.length === 0 ? (
          <div className="text-center text-gray-500 py-20">Nenhum funcionário cadastrado.</div>
        ) : (
          <div className="flex flex-col gap-3">
            {funcionarios.map(f => (
              <div key={f.id} className="bg-gray-900 rounded-2xl p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-900 rounded-full flex items-center justify-center text-blue-300 font-bold">
                    {f.nome.charAt(0).toUpperCase()}
                  </div>
                  <p className="text-white font-semibold">{f.nome}</p>
                </div>
                <button onClick={() => remover(f.id)} className="bg-red-900 hover:bg-red-800 text-red-300 px-3 py-1.5 rounded-lg text-sm transition">Remover</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center p-6 z-50">
          <div className="bg-gray-900 rounded-3xl p-8 w-full max-w-md">
            <h2 className="text-xl font-bold text-white mb-6">Novo funcionário</h2>
            <div className="flex flex-col gap-4">
              <input placeholder="Nome *" value={nome} onChange={e => setNome(e.target.value)} className="bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"/>
              <div className="flex gap-3">
                <button onClick={() => setModal(false)} className="flex-1 bg-gray-800 text-white py-3 rounded-xl">Cancelar</button>
                <button onClick={salvar} disabled={loading} className="flex-1 bg-blue-600 text-white font-semibold py-3 rounded-xl">
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