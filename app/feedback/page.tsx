'use client'
import { useState, useEffect } from 'react'
import { createClient } from '../supabase'
import { useRouter } from 'next/navigation'

export default function Feedback() {
  const [loja, setLoja] = useState<any>(null)
  const [mensagem, setMensagem] = useState('')
  const [tipo, setTipo] = useState('Ideia')
  const [loading, setLoading] = useState(false)
  const [enviado, setEnviado] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => { carregar() }, [])

  async function carregar() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const { data: lojaData } = await supabase.from('lojas').select('*').eq('user_id', user.id).single()
    if (!lojaData) { router.push('/onboarding'); return }
    setLoja(lojaData)
  }

  async function enviar() {
    if (!mensagem) return alert('Escreva uma mensagem!')
    setLoading(true)
    await supabase.from('feedbacks').insert({ loja_id: loja.id, mensagem, tipo })
    setMensagem('')
    setLoading(false)
    setEnviado(true)
    setTimeout(() => setEnviado(false), 3000)
  }

  return (
    <main className="min-h-screen bg-gray-950 p-6">
      <div className="max-w-2xl mx-auto">
        <button onClick={() => router.push('/dashboard')} className="text-gray-400 text-sm mb-4 hover:text-white">← Dashboard</button>
        <h1 className="text-3xl font-bold text-white mb-2">Feedback</h1>
        <p className="text-gray-400 mb-6">Sua opinião ajuda a melhorar o Commerly!</p>

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

          <button onClick={enviar} disabled={loading} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition">
            {loading ? 'Enviando...' : enviado ? '✓ Enviado!' : 'Enviar feedback'}
          </button>
        </div>
      </div>
    </main>
  )
}