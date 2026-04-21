'use client'
import { useState, useEffect } from 'react'
import { createClient } from '../supabase'
import { useRouter } from 'next/navigation'

export default function Login() {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) router.push('/dashboard')
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) router.push('/dashboard')
    })

    return () => subscription.unsubscribe()
  }, [])

  async function entrar() {
    setLoading(true)
    setErro('')
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha })
    if (error) { setErro('Email ou senha incorretos'); setLoading(false); return }
    router.push('/dashboard')
  }

  async function cadastrar() {
    setLoading(true)
    setErro('')
    const { error } = await supabase.auth.signUp({ email, password: senha })
    if (error) { setErro('Erro ao cadastrar. Tente outro email.'); setLoading(false); return }
    router.push('/onboarding')
  }

  return (
    <main className="min-h-screen bg-gray-950 flex items-center justify-center p-6">
      <div className="bg-gray-900 rounded-3xl p-8 w-full max-w-sm">
        <h1 className="text-3xl font-bold text-white mb-1">Commerly</h1>
        <p className="text-gray-400 mb-8">Acesse sua conta</p>

        {erro && <p className="text-red-400 text-sm mb-4">{erro}</p>}

        <div className="flex flex-col gap-4">
          <input
            type="email"
            placeholder="Seu email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            type="password"
            placeholder="Sua senha"
            value={senha}
            onChange={e => setSenha(e.target.value)}
            className="bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
          />

          <button onClick={entrar} disabled={loading} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition">
            {loading ? 'Entrando...' : 'Entrar'}
          </button>

          <button onClick={cadastrar} disabled={loading} className="bg-gray-800 hover:bg-gray-700 text-white font-semibold py-3 rounded-xl transition">
            {loading ? 'Cadastrando...' : 'Criar conta'}
          </button>
        </div>
      </div>
    </main>
  )
}