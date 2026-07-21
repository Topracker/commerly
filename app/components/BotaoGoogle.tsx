'use client'
import { useState } from 'react'
import { createClient } from '../supabase'

// Botão "Entrar com Google" compartilhado pelas 4 áreas de login. Após o
// consentimento, o Google devolve em /auth/callback?next=<voltar>, que troca o
// code por sessão e retorna para a página de login — cujo useEffect roteia o
// usuário conforme o papel. `voltar` é a rota da própria tela de login.
export default function BotaoGoogle({
  voltar,
  onErro,
}: {
  voltar: string
  onErro?: (msg: string) => void
}) {
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  async function entrar() {
    setLoading(true)
    onErro?.('')
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(voltar)}`
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    })
    // Em caso de sucesso o navegador já foi redirecionado ao Google.
    if (error) {
      onErro?.('Não foi possível entrar com o Google. Tente novamente.')
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-gray-700" />
        <span className="text-gray-500 text-xs">ou</span>
        <span className="h-px flex-1 bg-gray-700" />
      </div>
      <button
        onClick={entrar}
        disabled={loading}
        className="flex items-center justify-center gap-3 bg-white hover:bg-gray-100 disabled:opacity-60 text-gray-800 font-semibold py-3 rounded-xl transition"
      >
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
          <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.71-1.57 2.68-3.89 2.68-6.62z" />
          <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z" />
          <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z" />
          <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.47.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
        </svg>
        {loading ? 'Conectando…' : 'Entrar com Google'}
      </button>
    </div>
  )
}
