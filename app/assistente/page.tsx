'use client'
import { useState, useRef, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import { AppLayout } from '../components/AppLayout'
import { Send, Sparkles, Plus, MessageSquare } from 'lucide-react'

type Mensagem = {
  papel: 'usuario' | 'assistente'
  texto: string
}

type Conversa = {
  id: string
  pergunta: string
  resposta: string
  created_at: string
}

const SUGESTOES = [
  'Como estão minhas vendas este mês?',
  'Quais produtos devo repor no estoque?',
  'Quanto tenho de fiado pendente?',
  'Qual meu produto mais vendido?',
  'Como está meu resultado líquido?',
  'Quais clientes têm mais fiado?',
]

function tempoAtras(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `${min}min`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

export default function Assistente() {
  const { loja, loading, sair, supabase } = useAuth()
  const [mensagens, setMensagens] = useState<Mensagem[]>([])
  const [pergunta, setPergunta] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [historico, setHistorico] = useState<Conversa[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const fimRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensagens, enviando])

  useEffect(() => {
    if (loja) carregarHistorico()
  }, [loja])

  async function carregarHistorico() {
    const { data } = await supabase
      .from('assistente_conversas')
      .select('id, pergunta, resposta, created_at')
      .eq('loja_id', loja.id)
      .order('created_at', { ascending: false })
      .limit(30)
    setHistorico(data || [])
  }

  function novaConversa() {
    setMensagens([])
    setSelectedId(null)
    setPergunta('')
  }

  function abrirConversa(c: Conversa) {
    setSelectedId(c.id)
    setMensagens([
      { papel: 'usuario', texto: c.pergunta },
      { papel: 'assistente', texto: c.resposta },
    ])
  }

  async function enviar(texto?: string) {
    const q = (texto || pergunta).trim()
    if (!q || enviando) return
    setPergunta('')
    setSelectedId(null)
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
      carregarHistorico()
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

  const alturaChat = 'calc(100vh - 160px)'

  return (
    <AppLayout loja={loja} sair={sair} titulo="Assistente IA" maxWidth="max-w-5xl">
      <div className="flex gap-4" style={{ height: alturaChat }}>

        {/* Sidebar de histórico */}
        <aside className="hidden md:flex flex-col w-56 shrink-0 bg-gray-900 rounded-2xl overflow-hidden">
          {/* Botão nova conversa */}
          <div className="p-3 border-b border-gray-800 shrink-0">
            <button
              onClick={novaConversa}
              className="w-full flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold py-2.5 rounded-xl transition"
            >
              <Plus size={15} />
              Nova conversa
            </button>
          </div>

          {/* Lista de conversas */}
          <div className="flex-1 overflow-y-auto p-2">
            {historico.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-2 px-3 text-center">
                <MessageSquare size={24} className="text-gray-700" />
                <p className="text-gray-600 text-xs">Nenhuma conversa ainda</p>
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                {historico.map(c => (
                  <button
                    key={c.id}
                    onClick={() => abrirConversa(c)}
                    className={`w-full text-left px-3 py-2.5 rounded-xl transition group ${
                      selectedId === c.id
                        ? 'bg-purple-600'
                        : 'hover:bg-gray-800'
                    }`}
                  >
                    <p className={`text-xs font-medium truncate leading-snug ${
                      selectedId === c.id ? 'text-white' : 'text-gray-300'
                    }`}>
                      {c.pergunta}
                    </p>
                    <p className={`text-xs mt-0.5 ${
                      selectedId === c.id ? 'text-purple-200' : 'text-gray-600'
                    }`}>
                      {tempoAtras(c.created_at)} atrás
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </aside>

        {/* Área principal do chat */}
        <div className="flex-1 flex flex-col min-w-0">
          {mensagens.length === 0 ? (
            <div className="flex-1 overflow-y-auto flex flex-col items-center justify-center gap-6 px-2">
              <div className="text-center">
                <div className="w-16 h-16 rounded-full bg-purple-600 flex items-center justify-center mx-auto mb-4">
                  <Sparkles size={32} className="text-white" />
                </div>
                <h2 className="text-white text-xl font-bold mb-2">Olá! Como posso ajudar?</h2>
                <p className="text-gray-400 text-sm">Pergunte sobre suas vendas, estoque, gastos ou fiado.</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg">
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

              {/* Botão nova conversa mobile */}
              <button
                onClick={novaConversa}
                className="md:hidden flex items-center gap-2 text-gray-500 hover:text-gray-300 text-sm transition"
              >
                <Plus size={14} /> Nova conversa
              </button>
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

      </div>
    </AppLayout>
  )
}
