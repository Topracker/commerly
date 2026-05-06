'use client'
import { useState, useEffect } from 'react'
import { createClient } from '../supabase'
import { useRouter } from 'next/navigation'

export default function Login() {
  const [email, setEmail] = useState('')
  const [codigo, setCodigo] = useState('')
  const [etapa, setEtapa] = useState<'email' | 'otp'>('email')
  const [erro, setErro] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) router.push('/dashboard')
    })
  }, [])

  async function enviarCodigo() {
    if (!email) { setErro('Informe seu email'); return }
    setLoading(true)
    setErro('')
    const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } })
    if (error) { console.error('[OTP] signInWithOtp error:', error); setErro('Erro ao enviar código. Tente novamente.'); setLoading(false); return }
    setEtapa('otp')
    setLoading(false)
  }

  async function verificar() {
    if (codigo.length !== 6) { setErro('Digite o código de 6 dígitos'); return }
    setLoading(true)
    setErro('')
    const { error } = await supabase.auth.verifyOtp({ email, token: codigo, type: 'email' })
    if (error) { setErro('Código inválido ou expirado'); setLoading(false); return }
    const { data: { user } } = await supabase.auth.getUser()
    const { data } = await supabase.from('lojas').select('id').eq('user_id', user!.id).maybeSingle()
    router.push(data ? '/dashboard' : '/onboarding')
  }

  return (
    <main className="min-h-screen bg-gray-950 flex items-center justify-center p-6">
      <div className="bg-gray-900 rounded-3xl p-8 w-full max-w-sm">
        <h1 className="text-3xl font-bold text-white mb-1">Commerly</h1>
        <p className="text-gray-400 mb-8">
          {etapa === 'email' ? 'Acesse sua conta' : 'Verifique seu e-mail'}
        </p>

        {erro && <p className="text-red-400 text-sm mb-4">{erro}</p>}

        {etapa === 'email' ? (
          <div className="flex flex-col gap-4">
            <input
              type="email"
              placeholder="Seu email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && enviarCodigo()}
              className="bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={enviarCodigo}
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition"
            >
              {loading ? 'Enviando...' : 'Enviar código'}
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <p className="text-gray-400 text-sm">
              Código enviado para <strong className="text-white">{email}</strong>
            </p>
            <input
              type="text"
              inputMode="numeric"
              placeholder="000000"
              value={codigo}
              onChange={e => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))}
              onKeyDown={e => e.key === 'Enter' && verificar()}
              maxLength={6}
              autoFocus
              className="bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500 text-center text-2xl tracking-widest"
            />
            <button
              onClick={verificar}
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition"
            >
              {loading ? 'Verificando...' : 'Verificar código'}
            </button>
            <button
              onClick={() => { setEtapa('email'); setCodigo(''); setErro('') }}
              className="text-gray-500 text-sm hover:text-gray-400 transition"
            >
              ← Usar outro email
            </button>
          </div>
        )}
      </div>
    </main>
  )
}
