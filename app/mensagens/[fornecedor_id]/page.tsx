'use client'
import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '../../hooks/useAuth'
import { Send, ArrowLeft } from 'lucide-react'

export default function ChatComercianteFornecedor() {
  const { fornecedor_id } = useParams<{ fornecedor_id: string }>()
  const { loja, loading, supabase } = useAuth()
  const [fornecedor, setFornecedor] = useState<any>(null)
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
  }, [loja?.id, fornecedor_id])

  async function init() {
    const { data: f } = await supabase.from('fornecedores').select('id, nome, categoria').eq('id', fornecedor_id).single()
    if (!f) { router.push('/fornecedores'); return }
    setFornecedor(f)
    await fetchMsgs(loja!.id)
    setCarregando(false)
    supabase.from('mensagens')
      .update({ lida: true })
      .eq('loja_id', loja!.id)
      .eq('fornecedor_id', fornecedor_id)
      .eq('remetente', 'fornecedor')
      .eq('lida', false)
      .then(() => {})
  }

  async function fetchMsgs(lojaId: string) {
    const { data } = await supabase
      .from('mensagens')
      .select('*')
      .eq('loja_id', lojaId)
      .eq('fornecedor_id', fornecedor_id)
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
    await supabase.from('mensagens').insert({
      loja_id: loja.id,
      fornecedor_id,
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
  if (!loja || !fornecedor) return null

  return (
    <main className="h-screen bg-gray-950 flex flex-col">
      <header className="bg-gray-900 border-b border-gray-800 px-4 py-3 flex items-center gap-3 shrink-0">
        <button onClick={() => router.back()} className="text-gray-400 hover:text-white">
          <ArrowLeft size={20} />
        </button>
        <div>
          <p className="text-white font-bold">{fornecedor.nome}</p>
          <p className="text-xs text-purple-400">{fornecedor.categoria}</p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-2xl mx-auto flex flex-col gap-2">
          {mensagens.length === 0 && (
            <p className="text-center text-gray-500 py-12 text-sm">Nenhuma mensagem ainda. Inicie a conversa!</p>
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
