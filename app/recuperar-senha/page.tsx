'use client'
import { useState, Suspense } from 'react'
import { createClient } from '../supabase'
import { useRouter, useSearchParams } from 'next/navigation'

// Página compartilhada pelas 4 áreas (comerciante, cliente, entregador,
// fornecedor). O usuário digita o e-mail e recebe um link de redefinição.
// O link volta por /auth/callback (já na allowlist do Supabase, usado pelo
// OAuth) que troca o code por sessão de recuperação e manda para /nova-senha.
function RecuperarSenhaInner() {
  const [email, setEmail] = useState('')
  const [erro, setErro] = useState('')
  const [enviado, setEnviado] = useState(false)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const params = useSearchParams()
  const supabase = createClient()

  // Só aceitamos caminhos internos como destino do "voltar" (evita open redirect).
  const voltarRaw = params.get('voltar') || '/login'
  const voltar = voltarRaw.startsWith('/') && !voltarRaw.startsWith('//') ? voltarRaw : '/login'

  async function enviar() {
    if (!email) { setErro('Informe seu e-mail'); return }
    setLoading(true)
    setErro('')
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent('/nova-senha')}`
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })
    // Não revelamos se o e-mail existe (evita enumeração de contas): sempre
    // mostramos a mesma confirmação, mesmo que o e-mail não tenha conta.
    if (error) console.error('[recuperar-senha] resetPasswordForEmail error:', error)
    setEnviado(true)
    setLoading(false)
  }

  const inp = 'bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500'

  return (
    <main data-theme="dark" className="min-h-screen bg-gray-950 flex items-center justify-center p-6">
      <div className="bg-gray-900 rounded-3xl p-8 w-full max-w-md">
        <p className="text-blue-400 text-sm font-semibold mb-1">Recuperar acesso</p>
        <h1 className="text-2xl font-bold text-white mb-6">Esqueci minha senha</h1>

        {erro && <p className="text-red-400 text-sm mb-4">{erro}</p>}

        {enviado ? (
          <div className="flex flex-col gap-4">
            <p className="text-gray-300 text-sm">
              Se houver uma conta com <strong className="text-white">{email}</strong>, enviamos um
              link para redefinir a senha. Verifique sua caixa de entrada e o spam.
            </p>
            <button onClick={() => { setEnviado(false); setEmail('') }}
              className="text-blue-400 text-sm hover:text-blue-300 transition text-left">
              Enviar para outro e-mail
            </button>
            <button onClick={() => router.push(voltar)}
              className="text-gray-500 text-sm hover:text-gray-400 transition text-left">
              ← Voltar para o login
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <p className="text-gray-400 text-sm -mt-2">
              Digite o e-mail da sua conta e enviaremos um link para você criar uma nova senha.
            </p>
            <input type="email" autoComplete="email" placeholder="Seu e-mail" value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && enviar()} className={inp} />
            <button onClick={enviar} disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition">
              {loading ? 'Enviando...' : 'Enviar link de redefinição'}
            </button>
            <button onClick={() => router.push(voltar)}
              className="text-gray-500 text-sm hover:text-gray-400 transition">
              ← Voltar para o login
            </button>
          </div>
        )}
      </div>
    </main>
  )
}

export default function RecuperarSenha() {
  return (
    <Suspense fallback={null}>
      <RecuperarSenhaInner />
    </Suspense>
  )
}
