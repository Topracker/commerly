'use client'
import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

// Página compartilhada pelas 4 áreas (comerciante, cliente, entregador,
// fornecedor). O usuário digita o e-mail e recebe um link de redefinição.
//
// O envio NÃO passa mais pelo resetPasswordForEmail do Supabase: o template
// padrão do GoTrue entrega um `{{ .ConfirmationURL }}` que morre no primeiro
// GET (pré-visualização do cliente de e-mail / scanner de link), então o
// clique real do usuário chegava sempre com "link expirado". Agora chamamos
// /api/auth/recuperar, que gera o token pela Admin API e manda o e-mail pelo
// Resend com link direto para /nova-senha?token_hash=...&type=recovery.
function RecuperarSenhaInner() {
  const [email, setEmail] = useState('')
  const [erro, setErro] = useState('')
  const [enviado, setEnviado] = useState(false)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const params = useSearchParams()

  // Só aceitamos caminhos internos como destino do "voltar" (evita open redirect).
  const voltarRaw = params.get('voltar') || '/login'
  const voltar = voltarRaw.startsWith('/') && !voltarRaw.startsWith('//') ? voltarRaw : '/login'

  async function enviar() {
    if (!email) { setErro('Informe seu e-mail'); return }
    setLoading(true)
    setErro('')
    try {
      const res = await fetch('/api/auth/recuperar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      // A rota responde { ok: true } para qualquer desfecho (inclusive e-mail
      // sem conta) para não permitir enumeração. Só 400/429 viram mensagem.
      if (!res.ok) {
        const j = await res.json().catch(() => null)
        setErro(j?.erro || 'Não foi possível enviar o e-mail. Tente novamente.')
        setLoading(false)
        return
      }
      setEnviado(true)
    } catch {
      setErro('Falha de conexão. Verifique sua internet e tente novamente.')
    }
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
