'use client'
import { useState } from 'react'
import { Send, Sparkles } from 'lucide-react'

type Msg = { papel: 'usuario' | 'ia'; texto: string }

const SUGESTOES = [
  'Quanto custa?',
  'Tem delivery próprio?',
  'Dá pra controlar fiado?',
  'Precisa de cartão pra começar?',
]

export default function ChatIA() {
  const [mensagens, setMensagens] = useState<Msg[]>([])
  const [pergunta, setPergunta] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function enviar(texto?: string) {
    const p = (texto ?? pergunta).trim()
    if (!p || enviando) return
    setMensagens(m => [...m, { papel: 'usuario', texto: p }])
    setPergunta('')
    setEnviando(true)
    try {
      const r = await fetch('/api/conheca/perguntar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pergunta: p }),
      })
      const d = await r.json().catch(() => ({}))
      setMensagens(m => [...m, { papel: 'ia', texto: d.resposta || d.erro || 'Não consegui responder agora.' }])
    } catch {
      setMensagens(m => [...m, { papel: 'ia', texto: 'Deu erro de conexão — tenta de novo.' }])
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {mensagens.length === 0 && (
        <div className="flex flex-wrap gap-2">
          {SUGESTOES.map(s => (
            <button
              key={s}
              onClick={() => enviar(s)}
              className="text-xs bg-elevado border border-borda rounded-full px-3 py-1.5 hover:bg-borda transition"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {mensagens.length > 0 && (
        <div className="flex flex-col gap-2 max-h-72 overflow-y-auto">
          {mensagens.map((m, i) => (
            <div
              key={i}
              className={`text-sm rounded-xl px-3 py-2 max-w-[90%] ${
                m.papel === 'usuario' ? 'bg-azul text-white self-end' : 'bg-elevado text-gray-200 self-start flex gap-2'
              }`}
            >
              {m.papel === 'ia' && <Sparkles size={14} className="shrink-0 mt-0.5 text-acento" />}
              <span className="whitespace-pre-line">{m.texto}</span>
            </div>
          ))}
          {enviando && <div className="text-xs text-gray-500 self-start">Pensando...</div>}
        </div>
      )}

      <form
        onSubmit={e => { e.preventDefault(); enviar() }}
        className="flex gap-2"
      >
        <input
          value={pergunta}
          onChange={e => setPergunta(e.target.value)}
          placeholder="Digite sua dúvida..."
          maxLength={500}
          className="flex-1 bg-superficie border border-borda rounded-xl px-4 py-2.5 text-sm outline-none focus:border-azul/60"
        />
        <button
          type="submit"
          disabled={enviando || !pergunta.trim()}
          className="shrink-0 w-11 h-11 flex items-center justify-center rounded-xl bg-azul hover:brightness-110 disabled:opacity-50 transition"
        >
          <Send size={18} />
        </button>
      </form>
    </div>
  )
}
