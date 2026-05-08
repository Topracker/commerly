'use client'
import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '../../../hooks/useAuth'
import { Send, ArrowLeft } from 'lucide-react'

export default function ChatComerciante_Cliente() {
  const { cliente_id } = useParams<{ cliente_id: string }>()
  const { loja, loading, supabase } = useAuth()
  const [cliente, setCliente] = useState<any>(null)
  const [mensagens, setMensagens] = useState<any[]>([])
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [carregando, setCarregando] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  useEffect(() => {
    if (loja) init()
  }, [loja])

  useEffect(() => {
    if (!loja) return
    const interval = setInterval(() => fetchMsgs(loja.id), 3000)
    return () => clearInterval(interval)
  }, [loja?.id, cliente_id])

  async function init() {
    const { data: c } = await supabase.from('clientes').select('id, nome').eq('id', cliente_id).single()
    if (!c) { router.push('/mensagens'); return }
    setCliente(c)
    await fetchMsgs(loja!.id)
    setCarregando(false)
    supabase.from('mensagens_clientes')
      .update({ lida: true })
      .eq('loja_id', loja!.id)
      .eq('cliente_id', cliente_id)
      .eq('remetente', 'cliente')
      .eq('lida', false)
      .then(() => {})
  }

  async function fetchMsgs(lojaId: string) {
    const { data } = await supabase
      .from('mensagens_clientes')
      .select('*')
      .eq('loja_id', lojaId)
      .eq('cliente_id', cliente_id)
      .order('created_at', { ascending: true })
    if (data) {
      setMensagens(prev => {
        if (prev.length === data.length && prev.at(-1)?.id === data.at(-1)?.id) return prev
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
        return data
      })
    }
  }

  async function enviar() {
    if (!texto.trim() || enviando || !loja) return
    setEnviando(true)
    const t = texto.trim()
    setTexto('')
    await supabase.from('mensagens_clientes').insert({
      loja_id: loja.id,
      cliente_id,
      remetente: 'loja',
      conteudo: t,
    })
    await fetchMsgs(loja.id)
    setEnviando(false)
  }

  if (loading || carregando) return (
    <main className="min-h-screen bg-gray-950 flex items-center justify-center">
      <p className="text-gray-400">Carregando...</p>
    </main>
  )
  if (!loja || !cliente) return null

  return (
    <main className="h-screen bg-gray-950 flex flex-col">
      <header className="bg-gray-900 border-b border-gray-800 px-4 py-3 flex items-center gap-3 shrink-0">
        <button onClick={() => router.back()} className="text-gray-400 hover:text-white">
          <ArrowLeft size={20} />
        </button>
        <div>
          <p className="text-white font-bold">{cliente.nome}</p>
          <p className="text-xs text-green-400">Cliente</p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-2xl mx-auto flex flex-col gap-2">
          {mensagens.length === 0 && (
            <p className="text-center text-gray-500 py-12 text-sm">Nenhuma mensagem ainda.</p>
          )}
          {mensagens.map(m => (
            <div key={m.id} className={`flex ${m.remetente === 'loja' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-xs md:max-w-md rounded-2xl px-4 py-2.5 ${
                m.remetente === 'loja' ? 'bg-blue-600 text-white rounded-br-sm' : 'bg-gray-800 text-white rounded-bl-sm'
              }`}>
                <p className="text-sm">{m.conteudo}</p>
                <p className={`text-xs mt-1 ${m.remetente === 'loja' ? 'text-blue-200' : 'text-gray-400'}`}>
                  {new Date(m.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="shrink-0 bg-gray-900 border-t border-gray-800 p-4">
        <div className="max-w-2xl mx-auto flex gap-2">
          <input
            value={texto}
            onChange={e => setTexto(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && enviar()}
            placeholder="Digite uma mensagem..."
            className="flex-1 bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          />
          <button
            onClick={enviar}
            disabled={enviando || !texto.trim()}
            className="bg-blue-600 hover:bg-blue-700 text-white p-3 rounded-xl transition disabled:opacity-50"
          >
            <Send size={18} />
          </button>
        </div>
      </div>
    </main>
  )
}
