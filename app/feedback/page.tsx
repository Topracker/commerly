'use client'
import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import { AppLayout } from '../components/AppLayout'
import { Toast } from '../components/Toast'

export default function Feedback() {
  const { loja, loading, supabase, sair } = useAuth()
  const { toast, mostrarToast } = useToast()
  const [mensagem, setMensagem] = useState('')
  const [tipo, setTipo] = useState('Ideia')
  const [enviando, setEnviando] = useState(false)

  async function enviar() {
    if (!mensagem) { mostrarToast('Escreva uma mensagem!', 'erro'); return }
    setEnviando(true)
    const { error } = await supabase.from('feedbacks').insert({ loja_id: loja.id, mensagem, tipo })
    if (error) { mostrarToast('Erro ao enviar feedback', 'erro'); setEnviando(false); return }
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
