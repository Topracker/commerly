'use client'
import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useFornecedor } from '../../../hooks/useFornecedor'
import { Send, ArrowLeft } from 'lucide-react'

export default function ChatFornecedorLoja() {
  const { loja_id } = useParams<{ loja_id: string }>()
  const { fornecedor, loading, supabase } = useFornecedor()
  const [loja, setLoja] = useState<any>(null)
  const [mensagens, setMensagens] = useState<any[]>([])
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [carregando, setCarregando] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  useEffect(() => {
    if (fornecedor) init()
  }, [fornecedor])

  useEffect(() => {
    if (!fornecedor) return
    const interval = setInterval(() => fetchMsgs(fornecedor.id), 3000)
    return () => clearInterval(interval)
  }, [fornecedor?.id, loja_id])

  async function init() {
    const { data: l } = await supabase.from('lojas').select('id, nome, tipo').eq('id', loja_id).single()
    if (!l) { router.push('/fornecedor/mensagens'); return }
    setLoja(l)
    await fetchMsgs(fornecedor!.id)
    setCarregando(false)
    supabase.from('mensagens')
      .update({ lida: true })
      .eq('loja_id', loja_id)
      .eq('fornecedor_id', fornecedor!.id)
      .eq('remetente', 'loja')
      .eq('lida', false)
      .then(() => {})
  }

  async function fetchMsgs(fornecedorId: string) {
    const { data } = await supabase
      .from('mensagens')
      .select('*')
      .eq('loja_id', loja_id)
      .eq('fornecedor_id', fornecedorId)
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
    if (!texto.trim() || enviando || !fornecedor) return
    setEnviando(true)
    const t = texto.trim()
    setTexto('')
    await supabase.from('mensagens').insert({
      loja_id,
      fornecedor_id: fornecedor.id,
      remetente: 'fornecedor',
      conteudo: t,
    })
    await fetchMsgs(fornecedor.id)
    setEnviando(false)
  }

  if (loading || carregando) return (
    <main className="min-h-screen bg-gray-950 flex items-center justify-center">
      <p className="text-gray-400">Carregando...</p>
    </main>
  )
  if (!fornecedor || !loja) return null

  return (
    <main className="h-screen bg-gray-950 flex flex-col">
      <header className="bg-gray-900 border-b border-gray-800 px-4 py-3 flex items-center gap-3 shrink-0">
        <button onClick={() => router.push('/fornecedor/mensagens')} className="text-gray-400 hover:text-white">
          <ArrowLeft size={20} />
        </button>
        <div>
          <p className="text-white font-bold">{loja.nome}</p>
          <p className="text-xs text-blue-400">{loja.tipo}</p>
        </div>
        <span className="ml-auto text-xs bg-purple-900 text-purple-300 px-2 py-0.5 rounded-full">{fornecedor.nome}</span>
      </header>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-2xl mx-auto flex flex-col gap-2">
          {mensagens.length === 0 && (
            <p className="text-center text-gray-500 py-12 text-sm">Nenhuma mensagem ainda.</p>
          )}
          {mensagens.map(m => (
            <div key={m.id} className={`flex ${m.remetente === 'fornecedor' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-xs md:max-w-md rounded-2xl px-4 py-2.5 ${
                m.remetente === 'fornecedor' ? 'bg-purple-600 text-white rounded-br-sm' : 'bg-gray-800 text-white rounded-bl-sm'
              }`}>
                <p className="text-sm">{m.conteudo}</p>
                <p className={`text-xs mt-1 ${m.remetente === 'fornecedor' ? 'text-purple-200' : 'text-gray-400'}`}>
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
            className="flex-1 bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-purple-500 text-sm"
          />
          <button
            onClick={enviar}
            disabled={enviando || !texto.trim()}
            className="bg-purple-600 hover:bg-purple-700 text-white p-3 rounded-xl transition disabled:opacity-50"
          >
            <Send size={18} />
          </button>
        </div>
      </div>
    </main>
  )
}
