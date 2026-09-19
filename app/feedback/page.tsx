'use client'
import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import { AppLayout } from '../components/AppLayout'
import { Toast } from '../components/Toast'

export default function Feedback() {
  const { loja, loading, sair } = useAuth()
  const { toast, mostrarToast } = useToast()
  const [mensagem, setMensagem] = useState('')
  const [tipo, setTipo] = useState('Ideia')
  const [enviando, setEnviando] = useState(false)

  async function enviar() {
    if (!mensagem) { mostrarToast('Escreva uma mensagem!', 'erro'); return }
    setEnviando(true)
    // A rota resolve a loja pelo JWT, grava com service role (passa pelo
    // paywall — quem está com plano vencido também pode reclamar) e avisa a
    // equipe por e-mail. Aqui só vai o que o comerciante digitou.
    const res = await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo, mensagem }),
    }).catch(() => null)
    const corpo = await res?.json().catch(() => null)
    if (!res?.ok) { mostrarToast(corpo?.erro || 'Erro ao enviar feedback', 'erro'); setEnviando(false); return }
    mostrarToast('Feedback enviado! Obrigado!', 'sucesso')
    setMensagem('')
    setEnviando(false)
  }

  if (loading) return (
    <main className="min-h-screen bg-gray-950 flex items-center justify-center">
      <p className="text-gray-400">Carregando...</p>
    </main>
  )
  if (!loja) return null

  return (
    <AppLayout loja={loja} sair={sair} titulo="Feedback" maxWidth="max-w-2xl">
      <Toast toast={toast} />

      <p className="text-gray-400 mb-6 -mt-2">Sua opinião ajuda a melhorar o Commerly!</p>

      <div className="bg-gray-900 rounded-2xl p-6 flex flex-col gap-4">
        <div className="flex gap-3">
          {['Bug', 'Ideia', 'Melhoria'].map(t => (
            <button key={t} onClick={() => setTipo(t)}
              className={`flex-1 py-3 rounded-xl font-semibold transition text-sm ${tipo === t ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
              {t}
            </button>
          ))}
        </div>

        <textarea
          placeholder="Descreva sua sugestão, bug ou ideia..."
          value={mensagem}
          onChange={e => setMensagem(e.target.value)}
          rows={5}
          className="bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        />

        <button onClick={enviar} disabled={enviando} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition disabled:opacity-50">
          {enviando ? 'Enviando...' : 'Enviar feedback'}
        </button>
      </div>
    </AppLayout>
  )
}
