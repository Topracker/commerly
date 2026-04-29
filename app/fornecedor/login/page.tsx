'use client'
import { useState, useEffect } from 'react'
import { createClient } from '../../supabase'
import { useRouter } from 'next/navigation'

export default function FornecedorLogin() {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return
      const { data } = await supabase.from('fornecedores').select('id').eq('user_id', session.user.id).single()
      router.push(data ? '/fornecedor/dashboard' : '/fornecedor/onboarding')
    })
  }, [])

  async function entrar() {
    setLoading(true); setErro('')
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha })
    if (error) { setErro('Email ou senha incorretos'); setLoading(false); return }
    const { data: { user } } = await supabase.auth.getUser()
    const { data } = await supabase.from('fornecedores').select('id').eq('user_id', user!.id).single()
    router.push(data ? '/fornecedor/dashboard' : '/fornecedor/onboarding')
  }

  async function cadastrar() {
    setLoading(true); setErro('')
    const { error } = await supabase.auth.signUp({ email, password: senha })
    if (error) { setErro('Erro ao cadastrar. Tente outro email.'); setLoading(false); return }
    router.push('/fornecedor/onboarding')
  }

  return (
    <main className="min-h-screen bg-gray-950 flex items-center justify-center p-6">
      <div className="bg-gray-900 rounded-3xl p-8 w-full max-w-sm">
        <div className="mb-6">
          <p className="text-purple-400 text-sm font-semibold mb-1">Área do Fornecedor</p>
          <h1 className="text-3xl font-bold text-white mb-1">Commerly</h1>
          <p className="text-gray-400">Alcance mais comércios</p>
        </div>

        {erro && <p className="text-red-400 text-sm mb-4">{erro}</p>}

        <div className="flex flex-col gap-4">
          <input
            type="email"
            placeholder="Seu email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-purple-500"
          />
          <input
            type="password"
            placeholder="Sua senha"
            value={senha}
            onChange={e => setSenha(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && entrar()}
            className="bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-purple-500"
          />
          <button onClick={entrar} disabled={loading} className="bg-purple-600 hover:bg-purple-700 text-white font-semibold py-3 rounded-xl transition disabled:opacity-50">
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
          <button onClick={cadastrar} disabled={loading} className="bg-gray-800 hover:bg-gray-700 text-white font-semibold py-3 rounded-xl transition disabled:opacity-50">
            {loading ? 'Cadastrando...' : 'Criar conta'}
          </button>
          <button onClick={() => router.push('/')} className="text-gray-500 text-sm hover:text-gray-400 transition">
            ← Voltar ao início
          </button>
        </div>
      </div>
    </main>
  )
}
