'use client'
// #13 Commerly B2C Flash — criação (fornecedor) e banner com countdown (cliente).

import { useEffect, useState } from 'react'
import { Zap, Loader2 } from 'lucide-react'
import { formatarCountdown, restanteMs, DURACAO_PADRAO_MIN, DESCONTO_MIN, DESCONTO_MAX } from '../lib/flashSale'

type PromocaoAtiva = {
  id: string
  titulo: string
  desconto_percentual: number
  termina_em: string
  fornecedores?: { nome: string } | null
}

/** Countdown que respeita o relógio real (não acumula drift de setInterval). */
function useCountdown(terminaEm: string): number {
  const [ms, setMs] = useState(() => restanteMs({ termina_em: terminaEm }))
  useEffect(() => {
    const t = setInterval(() => setMs(restanteMs({ termina_em: terminaEm })), 1000)
    return () => clearInterval(t)
  }, [terminaEm])
  return ms
}

function Countdown({ terminaEm }: { terminaEm: string }) {
  const ms = useCountdown(terminaEm)
  if (ms <= 0) return <span className="text-gray-500">encerrada</span>
  return <span className="font-mono tabular-nums">{formatarCountdown(ms)}</span>
}

/** Banner das promoções ativas — feed e busca do cliente. */
export function FlashSaleBanner() {
  const [promocoes, setPromocoes] = useState<PromocaoAtiva[]>([])

  useEffect(() => {
    fetch('/api/flash-sale')
      .then(r => r.json())
      .then(d => setPromocoes(d.promocoes ?? []))
      .catch(() => {})
  }, [])

  // Some sozinho quando a última expira, sem precisar refazer a requisição.
  const vivas = promocoes.filter(p => restanteMs({ termina_em: p.termina_em }) > 0)
  if (vivas.length === 0) return null

  return (
    <div className="space-y-2">
      {vivas.map(p => (
        <div
          key={p.id}
          className="flex items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-gradient-to-r from-amber-500/15 to-transparent px-4 py-3"
        >
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-white">
              <Zap className="h-4 w-4 shrink-0 text-amber-400" />
              <span className="truncate">{p.titulo}</span>
            </p>
            <p className="mt-0.5 text-xs text-gray-400">
              {p.fornecedores?.nome ? `${p.fornecedores.nome} · ` : ''}
              {p.desconto_percentual}% de desconto
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-[10px] uppercase tracking-wide text-gray-500">Termina em</p>
            <p className="text-sm font-bold text-amber-400">
              <Countdown terminaEm={p.termina_em} />
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}

/** Formulário do fornecedor. */
export function FlashSaleForm({ onCriada }: { onCriada?: () => void }) {
  const [titulo, setTitulo] = useState('')
  const [desconto, setDesconto] = useState(20)
  const [duracao, setDuracao] = useState(DURACAO_PADRAO_MIN)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const [ok, setOk] = useState('')

  async function criar() {
    setErro(''); setOk(''); setEnviando(true)
    try {
      const r = await fetch('/api/flash-sale', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ titulo, desconto_percentual: desconto, duracao_min: duracao }),
      })
      const d = await r.json()
      if (!r.ok) { setErro(d.erro || 'Não foi possível criar a promoção.'); return }
      setOk(`Promoção no ar! ${d.notificados} clientes notificados.`)
      setTitulo('')
      onCriada?.()
    } catch {
      setErro('Erro de rede. Tente novamente.')
    } finally { setEnviando(false) }
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <h3 className="flex items-center gap-2 font-display text-base font-bold text-white">
        <Zap className="h-4 w-4 text-amber-400" /> Flash Sale
      </h3>
      <p className="mt-1 text-sm text-gray-400">
        Promoção-relâmpago com countdown no feed. Uma por vez.
      </p>

      <div className="mt-4 space-y-3">
        <input
          value={titulo}
          onChange={e => setTitulo(e.target.value)}
          maxLength={120}
          placeholder="Ex: Queima de estoque de refrigerante"
          className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white placeholder:text-gray-600 focus:border-white/25 focus:outline-none"
        />

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs text-gray-500">Desconto (%)</span>
            <input
              type="number"
              min={DESCONTO_MIN}
              max={DESCONTO_MAX}
              value={desconto}
              onChange={e => setDesconto(Number(e.target.value))}
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="text-xs text-gray-500">Duração (min)</span>
            <input
              type="number"
              min={5}
              max={1440}
              value={duracao}
              onChange={e => setDuracao(Number(e.target.value))}
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white focus:outline-none"
            />
          </label>
        </div>

        {erro && <p className="rounded-lg bg-red-500/10 p-2.5 text-sm text-red-400">{erro}</p>}
        {ok && <p className="rounded-lg bg-emerald-500/10 p-2.5 text-sm text-emerald-400">{ok}</p>}

        <button
          onClick={criar}
          disabled={enviando || !titulo.trim()}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 py-2.5 text-sm font-semibold text-black transition hover:bg-amber-400 disabled:opacity-50"
        >
          {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
          Lançar promoção
        </button>
      </div>
    </div>
  )
}
