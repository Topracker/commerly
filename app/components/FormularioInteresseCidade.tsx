'use client'
import { useState } from 'react'
import { MapPin, Check, Loader2 } from 'lucide-react'

// Formulário "quero a Commerly na minha cidade". Vive aqui, e não dentro de
// /expansao, porque duas telas o usam: a página de expansão e o aviso de
// cidade sem cobertura na busca do cliente. Mesma rota, mesma validação,
// mesma mensagem de sucesso — sem duas versões para manter em sincronia.

type Props = {
  /** Pré-preenche quando já sabemos onde a pessoa está (GPS/endereço). */
  cidadeInicial?: string
  ufInicial?: string
  /** Trava a cidade quando ela veio da localização detectada. */
  cidadeFixa?: boolean
  papel?: 'cliente' | 'comerciante' | 'entregador'
}

export default function FormularioInteresseCidade({
  cidadeInicial = '',
  ufInicial = '',
  cidadeFixa = false,
  papel = 'cliente',
}: Props) {
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [cidade, setCidade] = useState(cidadeInicial)
  const [uf, setUf] = useState(ufInicial)
  const [enviando, setEnviando] = useState(false)
  const [ok, setOk] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setErro(null); setOk(null)
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { setErro('Informe um e-mail válido.'); return }
    if (cidade.trim().length < 2) { setErro('Informe a sua cidade.'); return }
    setEnviando(true)
    try {
      const res = await fetch('/api/expansao/interesse', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome, email, cidade_nome: cidade, uf, papel }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setErro(d.error || 'Não foi possível registrar.'); setEnviando(false); return }
      setOk(`Prontinho! Você é a pessoa nº ${d.posicao} querendo a Commerly em ${cidade}. Vamos te avisar. 💛`)
      setNome(''); setEmail('')
      if (!cidadeFixa) { setCidade(''); setUf('') }
    } catch { setErro('Erro de rede. Tente de novo.') } finally { setEnviando(false) }
  }

  if (ok) {
    return (
      <div className="bg-acento/10 border border-acento/40 rounded-xl p-4 text-sm text-acento flex items-start gap-2">
        <Check size={16} className="shrink-0 mt-0.5" /> {ok}
      </div>
    )
  }

  const campo = 'bg-superficie border border-borda text-white rounded-xl px-3 py-2.5 outline-none focus:border-acento/60 text-sm'

  return (
    <form onSubmit={enviar} className="flex flex-col gap-2.5">
      <input value={nome} onChange={e => setNome(e.target.value)}
        placeholder="Seu nome (opcional)" className={campo} />
      <input value={email} onChange={e => setEmail(e.target.value)} type="email"
        autoComplete="email" placeholder="Seu e-mail *" className={campo} />
      {cidadeFixa ? (
        <p className="text-gray-500 text-xs px-1">
          Cidade: <strong className="text-gray-300">{cidade}{uf ? `/${uf}` : ''}</strong>
        </p>
      ) : (
        <div className="flex gap-2">
          <input value={cidade} onChange={e => setCidade(e.target.value)}
            placeholder="Sua cidade *" className={`flex-1 ${campo}`} />
          <input value={uf} onChange={e => setUf(e.target.value.toUpperCase().slice(0, 2))}
            placeholder="UF" maxLength={2} className={`w-16 uppercase ${campo}`} />
        </div>
      )}
      {erro && <p className="text-red-400 text-xs">{erro}</p>}
      <button type="submit" disabled={enviando}
        className="bg-acento hover:bg-acento-forte disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl transition flex items-center justify-center gap-2">
        {enviando ? <Loader2 size={16} className="animate-spin" /> : <MapPin size={16} />}
        Quero trazer a Commerly
      </button>
    </form>
  )
}
