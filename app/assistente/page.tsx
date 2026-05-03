'use client'
import { useState, useRef, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import { AppLayout } from '../components/AppLayout'
import { Send, Sparkles } from 'lucide-react'

type Mensagem = {
  papel: 'usuario' | 'assistente'
  texto: string
}

const SUGESTOES = [
  'Como estão minhas vendas este mês?',
  'Quais produtos devo repor no estoque?',
  'Quanto tenho de fiado pendente?',
  'Qual meu produto mais vendido?',
  'Como está meu resultado líquido?',
  'Quais clientes têm mais fiado?',
]

export default function Assistente() {
  const { loja, loading, sair } = useAuth()
  const [mensagens, setMensagens] = useState<Mensagem[]>([])
  const [pergunta, setPergunta] = useState('')
  const [enviando, setEnviando] = useState(false)
  const fimRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensagens, enviando])

  async function enviar(texto?: string) {
    const q = (texto || pergunta).trim()
    if (!q || enviando) return
    setPergunta('')
    setMensagens(prev => [...prev, { papel: 'usuario', texto: q }])
    setEnviando(true)
    try {
      const res = await fetch('/api/assistente', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pergunta: q }),
      })
      const data = await res.json()
      setMensagens(prev => [...prev, { papel: 'assistente', texto: data.resposta || data.erro || 'Erro ao gerar resposta.' }])
    } catch {
      setMensagens(prev => [...prev, { papel: 'assistente', texto: 'Erro de conexão. Tente novamente.' }])
    }
    setEnviando(false)
  }

  if (loading) return (
    <main className="min-h-screen bg-gray-950 flex items-center justify-center">
      <p className="text-gray-400">Carregando...</p>
    </main>
  )
  if (!loja) return null

  return (
    <AppLayout loja={loja} sair={sair} titulo="Assistente IA" maxWidth="max-w-2xl">
      <div className="flex flex-col" style={{ height: 'calc(100vh - 160px)' }}>

        {mensagens.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-6 px-2">
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-purple-600 flex items-center justify-center mx-auto mb-4">
                <Sparkles size={32} className="text-white" />
              </div>
              <h2 className="text-white text-xl font-bold mb-2">Olá! Como posso ajudar?</h2>
              <p className="text-gray-400 text-sm">Pergunte sobre suas vendas, estoque, gastos ou fiado.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full">
              {SUGESTOES.map(s => (
                <button
                  key={s}
                  onClick={() => enviar(s)}
                  className="text-left bg-gray-900 hover:bg-gray-800 text-gray-300 text-sm px-4 py-3 rounded-xl transition"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto flex flex-col gap-4 pb-4 pr-1">
            {mensagens.map((m, i) => (
              <div key={i} className={`flex ${m.papel === 'usuario' ? 'justify-end' : 'justify-start'}`}>
                {m.papel === 'assistente' && (
                  <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center mr-2 shrink-0 mt-1">
                    <Sparkles size={14} className="text-white" />
                  </div>
                )}
                <div className={`max-w-[80%] px-4 py-3 rounded-2xl text-sm whitespace-pre-wrap leading-relaxed ${
                  m.papel === 'usuario'
                    ? 'bg-blue-600 text-white rounded-br-sm'
                    : 'bg-gray-900 text-gray-100 rounded-bl-sm'
                }`}>
                  {m.texto}
                </div>
              </div>
            ))}
            {enviando && (
              <div className="flex justify-start">
                <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center mr-2 shrink-0">
                  <Sparkles size={14} className="text-white" />
                </div>
                <div className="bg-gray-900 px-4 py-3 rounded-2xl rounded-bl-sm">
                  <div className="flex gap-1 items-center h-5">
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={fimRef} />
          </div>
        )}

        <div className="pt-4 border-t border-gray-800 shrink-0">
          <div className="flex gap-2">
            <input
              value={pergunta}
              onChange={e => setPergunta(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar() } }}
              placeholder="Pergunte sobre sua loja..."
              disabled={enviando}
              className="flex-1 bg-gray-900 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-purple-500 text-sm disabled:opacity-50"
            />
            <button
              onClick={() => enviar()}
              disabled={!pergunta.trim() || enviando}
              className="bg-purple-600 hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed text-white p-3 rounded-xl transition shrink-0"
            >
              <Send size={18} />
            </button>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
