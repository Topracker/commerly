'use client'
import { useState, useEffect } from 'react'
import { createClient } from '../../supabase'
import { useRouter } from 'next/navigation'

export default function ClienteOnboarding() {
  const [nome, setNome] = useState('')
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) router.push('/cliente/login')
    })
  }, [])

  async function salvar() {
    if (!nome.trim()) { setErro('Informe seu nome!'); return }
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('clientes').insert({ user_id: user!.id, nome: nome.trim() })
    if (error) { setErro('Erro ao salvar. Tente novamente.'); setLoading(false); return }
    router.push('/cliente/buscar')
  }

  return (
    <main className="min-h-screen bg-gray-950 flex items-center justify-center p-6">
      <div className="bg-gray-900 rounded-3xl p-8 w-full max-w-sm">
        <p className="text-green-400 text-sm font-semibold mb-1">Área do Cliente</p>
        <h1 className="text-2xl font-bold text-white mb-1">Bem-vindo!</h1>
        <p className="text-gray-400 mb-6">Como podemos te chamar?</p>

        {erro && <p className="text-red-400 text-sm mb-4">{erro}</p>}

        <div className="flex flex-col gap-4">
          <input
            placeholder="Seu nome *"
            value={nome}
            onChange={e => setNome(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && salvar()}
            className="bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-green-500"
          />
          <button onClick={salvar} disabled={loading} className="bg-green-600 hover:bg-green-700 text-white font-semibold py-3 rounded-xl transition disabled:opacity-50">
            {loading ? 'Salvando...' : 'Começar a explorar'}
          </button>
        </div>
      </div>
    </main>
  )
}
