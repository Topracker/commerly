'use client'
import { useState } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { formatarTelefone, erroTelefone } from '../lib/validacoes'

// Lista de espera do Kit Oficial. Substitui o antigo botão "Pedir meu kit",
// que abria um pedido 'aguardando_pagamento' sem forma de pagar e prendia o
// entregador num pedido pendente para sempre.
export function KitInteresse() {
  const [nome, setNome] = useState('')
  const [telefone, setTelefone] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [pronto, setPronto] = useState<{ jaEstava: boolean } | null>(null)

  async function enviar() {
    if (nome.trim().length < 2) { setErro('Informe seu nome.'); return }
    const et = erroTelefone(telefone)
    if (et) { setErro(et); return }

    setEnviando(true); setErro('')
    try {
      const res = await fetch('/api/kit/interesse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: nome.trim(), telefone }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setErro(d.error || 'Não foi possível registrar. Tente de novo.'); return }
      setPronto({ jaEstava: !!d.jaEstava })
    } catch {
      setErro('Sem conexão. Tente de novo.')
    } finally {
      setEnviando(false)
    }
  }

  if (pronto) {
    return (
      <div className="rounded-xl border border-green-500/40 bg-green-500/10 p-4 flex items-start gap-2.5">
        <Check size={18} className="text-green-400 shrink-0 mt-0.5" />
        <div>
          <p className="text-green-300 font-semibold text-sm">
            {pronto.jaEstava ? 'Você já está na lista' : 'Prontinho, você está na lista'}
          </p>
          <p className="text-green-200/80 text-xs mt-1">
            Avisamos no seu WhatsApp assim que a venda do kit abrir. Até lá, é só usar sua bolsa térmica.
          </p>
        </div>
      </div>
    )
  }

  const inp = 'w-full bg-superficie border border-borda text-white rounded-xl px-4 py-3 outline-none focus:border-acento/60 transition text-sm'

  return (
    <div className="flex flex-col gap-3">
      <p className="text-gray-400 text-sm">Quer ser avisado quando o kit entrar à venda? Deixe seu contato:</p>
      <div className="grid sm:grid-cols-2 gap-3">
        <input
          type="text" autoComplete="name" placeholder="Seu nome" value={nome}
          onChange={e => { setNome(e.target.value); setErro('') }} className={inp}
        />
        <input
          type="tel" inputMode="numeric" autoComplete="tel" placeholder="(11) 98765-4321" value={telefone}
          onChange={e => { setTelefone(formatarTelefone(e.target.value)); setErro('') }} className={inp}
        />
      </div>
      {erro && <p className="text-red-400 text-sm">{erro}</p>}
      <button
        onClick={enviar}
        disabled={enviando}
        className="self-start bg-acento hover:bg-acento-forte disabled:opacity-60 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition flex items-center gap-2"
      >
        {enviando && <Loader2 size={15} className="animate-spin" />}
        {enviando ? 'Registrando…' : 'Avise-me quando lançar'}
      </button>
      <p className="text-gray-600 text-xs">Só usamos seu contato para avisar do kit.</p>
    </div>
  )
}
