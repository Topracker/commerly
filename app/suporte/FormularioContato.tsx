'use client'
import { useState, useEffect } from 'react'
import { createClient } from '../supabase'
import { Check, Copy, Send } from 'lucide-react'

// Formulário de contato do /suporte (caminho principal) + botão de copiar o
// e-mail (caminho alternativo, para quem prefere escrever do próprio cliente).
// A página em si é server component por causa do metadata, então só este
// pedaço é client.

const ASSUNTOS = ['Dúvida', 'Problema técnico', 'Financeiro', 'Sugestão', 'Outro'] as const

export function BotaoCopiarEmail({ email }: { email: string }) {
  const [copiado, setCopiado] = useState(false)

  async function copiar() {
    try {
      await navigator.clipboard.writeText(email)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      // Sem permissão de clipboard (http, navegador antigo): o endereço segue
      // visível ao lado, então dá para selecionar na mão.
    }
  }

  return (
    <button onClick={copiar} type="button"
      className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-200 border border-gray-700 hover:border-gray-600 rounded-lg px-2.5 py-1.5 transition shrink-0"
      aria-label={`Copiar ${email}`}>
      {copiado ? <Check size={13} className="text-green-400" /> : <Copy size={13} />}
      {copiado ? 'Copiado!' : 'Copiar'}
    </button>
  )
}

export default function FormularioContato() {
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [assunto, setAssunto] = useState<string>('')
  const [mensagem, setMensagem] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [enviado, setEnviado] = useState(false)

  // Quem já está logado não deveria redigitar nome e e-mail. Silencioso de
  // propósito: visitante anônimo é o caso normal aqui, não um erro.
  useEffect(() => {
    let ativo = true
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      const user = data?.user
      if (!ativo || !user) return
      setEmail(atual => atual || user.email || '')
      const meta = user.user_metadata as { nome?: string; full_name?: string; name?: string } | undefined
      const nomeMeta = meta?.nome || meta?.full_name || meta?.name || ''
      if (nomeMeta) setNome(atual => atual || nomeMeta)
    })
    return () => { ativo = false }
  }, [])

  async function enviar() {
    if (nome.trim().length < 2) { setErro('Informe seu nome.'); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setErro('Informe um e-mail válido.'); return }
    if (!assunto) { setErro('Escolha um assunto.'); return }
    if (mensagem.trim().length < 10) { setErro('Escreva sua mensagem com pelo menos 10 caracteres.'); return }

    setEnviando(true)
    setErro('')
    try {
      const res = await fetch('/api/suporte/contato', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: nome.trim(), email: email.trim(), assunto, mensagem: mensagem.trim() }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => null)
        setErro(j?.erro || 'Não foi possível enviar sua mensagem. Tente novamente.')
        setEnviando(false)
        return
      }
      setEnviado(true)
    } catch {
      setErro('Falha de conexão. Verifique sua internet e tente novamente.')
    }
    setEnviando(false)
  }

  const campo = 'bg-gray-900 border border-gray-800 text-white text-sm rounded-xl px-3.5 py-2.5 outline-none focus:border-blue-600 transition w-full placeholder:text-gray-600'

  if (enviado) {
    return (
      <div className="bg-gray-900 border border-green-800/60 rounded-2xl p-5 flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-green-500/15 flex items-center justify-center shrink-0">
          <Check size={17} className="text-green-300" />
        </div>
        <div className="min-w-0">
          <p className="text-white font-semibold text-sm">Mensagem enviada! Respondemos em até 1 dia útil.</p>
          <p className="text-gray-500 text-xs mt-1">
            A resposta vai para <strong className="text-gray-300 break-all">{email}</strong>.
          </p>
          <button type="button"
            onClick={() => { setEnviado(false); setAssunto(''); setMensagem('') }}
            className="text-blue-400 text-xs hover:text-blue-300 transition mt-2.5">
            Enviar outra mensagem
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 flex flex-col gap-3">
      {erro && <p className="text-red-400 text-sm">{erro}</p>}

      <div className="grid sm:grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="sup-nome" className="text-gray-400 text-xs font-medium">Seu nome</label>
          <input id="sup-nome" value={nome} onChange={e => setNome(e.target.value)}
            autoComplete="name" maxLength={100} placeholder="Como podemos te chamar" className={campo} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="sup-email" className="text-gray-400 text-xs font-medium">Seu e-mail</label>
          <input id="sup-email" type="email" value={email} onChange={e => setEmail(e.target.value)}
            autoComplete="email" maxLength={254} placeholder="voce@exemplo.com" className={campo} />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="sup-assunto" className="text-gray-400 text-xs font-medium">Assunto</label>
        <select id="sup-assunto" value={assunto} onChange={e => setAssunto(e.target.value)}
          className={`${campo} ${assunto ? '' : 'text-gray-600'}`}>
          <option value="">Selecione…</option>
          {ASSUNTOS.map(a => <option key={a} value={a} className="text-white">{a}</option>)}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="sup-mensagem" className="text-gray-400 text-xs font-medium">Mensagem</label>
        <textarea id="sup-mensagem" value={mensagem} onChange={e => setMensagem(e.target.value)}
          rows={5} maxLength={5000}
          placeholder="Descreva o que aconteceu. Se for um problema, o horário e uma captura de tela ajudam muito."
          className={`${campo} resize-y min-h-[110px]`} />
        <p className="text-gray-600 text-[11px] text-right">{mensagem.length}/5000</p>
      </div>

      <button onClick={enviar} disabled={enviando}
        className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm py-3 rounded-xl transition flex items-center justify-center gap-2">
        <Send size={15} />
        {enviando ? 'Enviando...' : 'Enviar mensagem'}
      </button>

      <p className="text-gray-600 text-[11px] text-center">
        Respondemos em até 1 dia útil, no e-mail informado acima.
      </p>
    </div>
  )
}
