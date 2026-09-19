'use client'
import { useState } from 'react'
import { Mail } from 'lucide-react'

// Formulário da página pública: e-mail → /api/conta/link-publico → link por
// e-mail que leva ao passo de confirmação já autenticado. A resposta é sempre
// a mesma, exista a conta ou não.
export function FormularioExclusao() {
  const [email, setEmail] = useState('')
  const [estado, setEstado] = useState<'idle' | 'enviando' | 'enviado' | 'erro'>('idle')
  const [erro, setErro] = useState('')

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    setEstado('enviando')
    const res = await fetch('/api/conta/link-publico', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }),
    })
    const j = await res.json().catch(() => null)
    if (!res.ok) { setErro(j?.erro || 'Não foi possível enviar agora. Tente novamente.'); setEstado('erro'); return }
    setEstado('enviado')
  }

  if (estado === 'enviado') {
    return (
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-4 text-sm text-gray-300 leading-relaxed">
        Se existir uma conta Commerly com <strong className="text-white">{email}</strong>, enviamos um link para
        confirmar a exclusão. Ele vale por 1 hora. Confira também a caixa de spam.
      </div>
    )
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-3">
      <label className="text-gray-400 text-sm">
        E-mail da conta
        <input
          type="email" required value={email} onChange={e => setEmail(e.target.value)}
          placeholder="voce@exemplo.com"
          className="mt-1 w-full bg-gray-900 border border-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-red-500"
        />
      </label>
      {erro && <p className="text-red-400 text-sm">{erro}</p>}
      <button
        type="submit" disabled={estado === 'enviando'}
        className="inline-flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition"
      >
        <Mail size={16} /> {estado === 'enviando' ? 'Enviando…' : 'Enviar link de exclusão'}
      </button>
    </form>
  )
}
