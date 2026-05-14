'use client'
import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useCliente } from '../../../hooks/useCliente'
import { ClienteLayout } from '../../../components/ClienteLayout'
import { Send, ArrowLeft } from 'lucide-react'

export default function ChatCliente_Loja() {
  const { loja_id } = useParams<{ loja_id: string }>()
  const { cliente, loading, supabase, sair } = useCliente()
  const [loja, setLoja] = useState<any>(null)
  const [mensagens, setMensagens] = useState<any[]>([])
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [carregando, setCarregando] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  useEffect(() => {
    if (cliente) init()
  }, [cliente])

  useEffect(() => {
    if (!cliente) return
    const interval = setInterval(() => fetchMsgs(cliente.id), 3000)
    return () => clearInterval(interval)
  }, [cliente?.id, loja_id])

  async function init() {
    const { data: l } = await supabase.from('lojas_publicas').select('id, nome, tipo').eq('id', loja_id).single()
    if (!l) { router.push('/cliente/buscar'); return }
    setLoja(l)
    await fetchMsgs(cliente!.id)
    setCarregando(false)
    supabase.from('mensagens_clientes')
      .update({ lida: true })
      .eq('loja_id', loja_id)
      .eq('cliente_id', cliente!.id)
      .eq('remetente', 'loja')
      .eq('lida', false)
      .then(() => {})
  }

  async function fetchMsgs(clienteId: string) {
    const { data } = await supabase
      .from('mensagens_clientes')
      .select('*')
      .eq('loja_id', loja_id)
      .eq('cliente_id', clienteId)
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
    if (!texto.trim() || enviando || !cliente) return
    setEnviando(true)
    const t = texto.trim()
    setTexto('')
    await supabase.from('mensagens_clientes').insert({
      loja_id,
      cliente_id: cliente.id,
      remetente: 'cliente',
      conteudo: t,
    })
    await fetchMsgs(cliente.id)
    setEnviando(false)
  }

  if (loading || (carregando && !loja)) return (
    <main className="min-h-screen bg-gray-950 flex items-center justify-center">
      <p className="text-gray-400">Carregando...</p>
    </main>
  )
  if (!cliente) return null

  return (
    <ClienteLayout cliente={cliente} sair={sair} fullHeight noPadding>
      <header className="bg-gray-900 border-b border-gray-800 px-4 py-3 flex items-center gap-3 shrink-0">
        <button onClick={() => router.back()} className="text-gray-400 hover:text-white">
          <ArrowLeft size={20} />
        </button>
        <div>
          <p className="text-white font-bold">{loja?.nome}</p>
          <p className="text-xs text-green-400">{loja?.tipo}</p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-2xl mx-auto flex flex-col gap-2">
          {mensagens.length === 0 && (
            <p className="text-center text-gray-500 py-12 text-sm">Nenhuma mensagem ainda. Inicie a conversa!</p>
          )}
          {mensagens.map(m => (
            <div key={m.id} className={`flex ${m.remetente === 'cliente' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-xs md:max-w-md rounded-2xl px-4 py-2.5 ${
                m.remetente === 'cliente' ? 'bg-green-600 text-white rounded-br-sm' : 'bg-gray-800 text-white rounded-bl-sm'
              }`}>
                <p className="text-sm">{m.conteudo}</p>
                <p className={`text-xs mt-1 ${m.remetente === 'cliente' ? 'text-green-200' : 'text-gray-400'}`}>
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
            className="flex-1 bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-green-500 text-sm"
          />
          <button
            onClick={enviar}
            disabled={enviando || !texto.trim()}
            className="bg-green-600 hover:bg-green-700 text-white p-3 rounded-xl transition disabled:opacity-50"
          >
            <Send size={18} />
          </button>
        </div>
      </div>
    </ClienteLayout>
  )
}
