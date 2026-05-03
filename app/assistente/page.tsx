'use client'
import { useState, useRef, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import { AppLayout } from '../components/AppLayout'
import { Send, Sparkles, Clock, ChevronDown, ChevronUp, Plus } from 'lucide-react'

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
  if (min < 60) return `${min}min atrás`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h atrás`
  const d = Math.floor(h / 24)
  return `${d}d atrás`
}

export default function Assistente() {
  const { loja, loading, sair, supabase } = useAuth()
  const [mensagens, setMensagens] = useState<Mensagem[]>([])
  const [pergunta, setPergunta] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [historico, setHistorico] = useState<Conversa[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)
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
      .limit(20)
    setHistorico(data || [])
  }

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
      const resposta = data.resposta || data.erro || 'Erro ao gerar resposta.'
      setMensagens(prev => [...prev, { papel: 'assistente', texto: resposta }])
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

  return (
    <AppLayout loja={loja} sair={sair} titulo="Assistente IA" maxWidth="max-w-2xl">
      <div className="flex flex-col" style={{ height: 'calc(100vh - 160px)' }}>

        {mensagens.length === 0 ? (
          <div className="flex-1 overflow-y-auto">
            {/* Boas-vindas + sugestões */}
            <div className="flex flex-col items-center gap-6 px-2 pt-4 pb-6">
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

            {/* Histórico */}
            {historico.length > 0 && (
              <div className="px-0 pb-4">
                <div className="flex items-center gap-2 mb-3">
                  <Clock size={14} className="text-gray-500" />
                  <p className="text-gray-500 text-xs font-semibold uppercase tracking-wide">Conversas anteriores</p>
                </div>
                <div className="flex flex-col gap-2">
                  {historico.map(c => (
                    <div key={c.id} className="bg-gray-900 rounded-xl overflow-hidden">
                      <button
                        onClick={() => setExpandedId(expandedId === c.id ? null : c.id)}
                        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-800 transition text-left gap-3"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-gray-200 text-sm truncate">{c.pergunta}</p>
                          <p className="text-gray-500 text-xs mt-0.5">{tempoAtras(c.created_at)}</p>
                        </div>
                        {expandedId === c.id
                          ? <ChevronUp size={16} className="text-gray-500 shrink-0" />
                          : <ChevronDown size={16} className="text-gray-500 shrink-0" />
                        }
                      </button>
                      {expandedId === c.id && (
                        <div className="px-4 pb-4 flex flex-col gap-3 border-t border-gray-800 pt-3">
                          <div className="flex justify-end">
                            <div className="bg-blue-600 text-white text-sm px-4 py-2 rounded-2xl rounded-br-sm max-w-[85%] whitespace-pre-wrap leading-relaxed">
                              {c.pergunta}
                            </div>
                          </div>
                          <div className="flex justify-start gap-2">
                            <div className="w-7 h-7 rounded-full bg-purple-600 flex items-center justify-center shrink-0 mt-1">
                              <Sparkles size={12} className="text-white" />
                            </div>
                            <div className="bg-gray-800 text-gray-100 text-sm px-4 py-2 rounded-2xl rounded-bl-sm max-w-[85%] whitespace-pre-wrap leading-relaxed">
                              {c.resposta}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto flex flex-col gap-4 pb-4 pr-1">
            <div className="flex justify-end">
              <button
                onClick={() => setMensagens([])}
                className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition mb-1"
              >
                <Plus size={13} /> Nova conversa
              </button>
            </div>
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
