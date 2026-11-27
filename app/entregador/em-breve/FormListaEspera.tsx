'use client'
import { useState } from 'react'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { codigoDeConvite } from '../../lib/convite'

type SimNao = boolean | null

function SimNaoCampo({ rotulo, valor, onChange }: { rotulo: string; valor: SimNao; onChange: (v: boolean) => void }) {
  return (
    <fieldset>
      <legend className="text-gray-300 text-sm mb-1.5">{rotulo}</legend>
      <div className="flex gap-2">
        {[true, false].map(v => (
          <button key={String(v)} type="button" onClick={() => onChange(v)} aria-pressed={valor === v}
            className={`flex-1 py-2.5 rounded-xl border text-sm font-medium transition ${valor === v
              ? 'border-acento bg-acento/15 text-acento' : 'border-borda text-gray-400 hover:text-white'}`}>
            {v ? 'Sim' : 'Não'}
          </button>
        ))}
      </div>
    </fieldset>
  )
}

export function FormListaEspera() {
  const [nome, setNome] = useState('')
  const [telefone, setTelefone] = useState('')
  const [cidade, setCidade] = useState('Goiânia')
  const [bairro, setBairro] = useState('')
  const [temMoto, setTemMoto] = useState<SimNao>(null)
  const [temCnh, setTemCnh] = useState<SimNao>(null)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const [ok, setOk] = useState(false)

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    if (enviando) return
    if (temMoto === null || temCnh === null) { setErro('Responda se tem moto própria e CNH.'); return }
    setErro('')
    setEnviando(true)
    let codigo: string | null = null
    try { codigo = codigoDeConvite() } catch { /* sem storage: segue sem código */ }
    const r = await fetch('/api/publico/entregador-interesse', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome, telefone, cidade, bairro, tem_moto: temMoto, tem_cnh: temCnh, codigo_indicacao: codigo, origem: 'em-breve' }),
    }).catch(() => null)
    const j = r ? await r.json().catch(() => null) : null
    setEnviando(false)
    if (!r || !r.ok || !j?.ok) { setErro(j?.error || 'Não foi possível enviar. Confira sua internet e tente de novo.'); return }
    setOk(true)
  }

  if (ok) {
    return (
      <div className="bg-card border border-acento/40 rounded-2xl p-6 text-center max-w-lg mx-auto">
        <CheckCircle2 size={40} className="text-acento mx-auto mb-3" />
        <p className="text-white text-lg font-semibold">Cadastro recebido!</p>
        <p className="text-gray-300 text-sm mt-2">Avisamos assim que o delivery abrir na sua região.</p>
        <p className="text-gray-500 text-xs mt-4">Isto ainda não é uma conta de entregador: chamamos você pelo WhatsApp quando o bairro abrir.</p>
      </div>
    )
  }

  const campo = 'w-full bg-superficie border border-borda rounded-xl px-3.5 py-2.5 text-white text-sm placeholder:text-gray-600 focus:outline-none focus:border-acento'
  return (
    <form onSubmit={enviar} className="bg-card border border-borda rounded-2xl p-5 sm:p-6 max-w-lg mx-auto space-y-4">
      <p className="text-white font-semibold">Entrar na lista de espera</p>
      <label className="block">
        <span className="text-gray-300 text-sm">Nome</span>
        <input className={`${campo} mt-1.5`} value={nome} onChange={e => setNome(e.target.value)} required minLength={2} maxLength={120} autoComplete="name" />
      </label>
      <label className="block">
        <span className="text-gray-300 text-sm">WhatsApp (com DDD)</span>
        <input className={`${campo} mt-1.5`} value={telefone} onChange={e => setTelefone(e.target.value)} required inputMode="tel" autoComplete="tel" placeholder="62 99999-9999" />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-gray-300 text-sm">Cidade</span>
          <input className={`${campo} mt-1.5`} value={cidade} onChange={e => setCidade(e.target.value)} required minLength={2} maxLength={80} />
        </label>
        <label className="block">
          <span className="text-gray-300 text-sm">Bairro onde roda</span>
          <input className={`${campo} mt-1.5`} value={bairro} onChange={e => setBairro(e.target.value)} required minLength={2} maxLength={80} placeholder="Setor Bueno" />
        </label>
      </div>
      <SimNaoCampo rotulo="Tem moto própria?" valor={temMoto} onChange={setTemMoto} />
      <SimNaoCampo rotulo="Tem CNH (habilitação)?" valor={temCnh} onChange={setTemCnh} />
      {erro && <p className="text-red-400 text-sm" role="alert">{erro}</p>}
      <button type="submit" disabled={enviando}
        className="w-full bg-acento hover:bg-acento-forte disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition flex items-center justify-center gap-2">
        {enviando && <Loader2 size={16} className="animate-spin" />} Quero ser avisado
      </button>
      <p className="text-gray-500 text-xs text-center">Usamos seu contato só para avisar sobre a abertura do delivery. <a href="/privacidade" className="underline">Privacidade</a></p>
    </form>
  )
}
