'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useCliente } from '../../hooks/useCliente'
import { ClienteLayout } from '../../components/ClienteLayout'
import { useToast } from '../../hooks/useToast'
import { Toast } from '../../components/Toast'
import { CriarFestaModal } from '../../components/CriarFestaModal'
import { FESTA_STATUS_META, normalizarCodigo, type FestaStatus } from '../../lib/festas'
import { PartyPopper, Plus, Users, Ticket, ArrowRight, Crown } from 'lucide-react'

type FestaCard = {
  id: string; nome: string; codigo: string; status: FestaStatus
  sou_criador: boolean; meus_itens: number; participantes: number
  taxa_por_pessoa: number | null; created_at: string
}

export default function FestasHub() {
  const { cliente, loading, sair } = useCliente()
  const { toast, mostrarToast } = useToast()
  const router = useRouter()
  const [festas, setFestas] = useState<FestaCard[]>([])
  const [carregando, setCarregando] = useState(true)
  const [criar, setCriar] = useState(false)
  const [codigo, setCodigo] = useState('')
  const [entrando, setEntrando] = useState(false)

  const carregar = useCallback(async () => {
    const d = await fetch('/api/festa/minhas').then(r => (r.ok ? r.json() : { festas: [] })).catch(() => ({ festas: [] }))
    setFestas(d.festas || [])
    setCarregando(false)
  }, [])

  useEffect(() => { if (cliente) void carregar() }, [cliente, carregar])

  async function entrar(e: React.FormEvent) {
    e.preventDefault()
    const cod = normalizarCodigo(codigo)
    if (cod.length < 4) { mostrarToast('Digite o código do convite.', 'erro'); return }
    setEntrando(true)
    try {
      const res = await fetch('/api/festa/entrar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codigo: cod }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok || !d.festa?.id) { mostrarToast(d.error || 'Não foi possível entrar.', 'erro'); setEntrando(false); return }
      router.push(`/cliente/festa/${d.festa.id}`)
    } catch { mostrarToast('Erro de rede.', 'erro'); setEntrando(false) }
  }

  if (loading) return (
    <main className="min-h-screen bg-gray-950 flex items-center justify-center">
      <p className="text-gray-400">Carregando...</p>
    </main>
  )
  if (!cliente) return null

  return (
    <ClienteLayout cliente={cliente} sair={sair}>
      <Toast toast={toast} />
      <div className="max-w-2xl mx-auto font-body">
        <div className="flex items-center gap-3 mb-1">
          <PartyPopper size={26} className="text-acento" />
          <h1 className="font-display text-2xl font-bold text-white">Modo Festa</h1>
        </div>
        <p className="text-gray-400 text-sm mb-6">
          Junte seus amigos, peça de até 3 lojas próximas e receba tudo num endereço só —
          a taxa de entrega é dividida entre todos.
        </p>

        {/* Ações */}
        <div className="grid gap-3 sm:grid-cols-2 mb-6">
          <button
            onClick={() => setCriar(true)}
            className="flex items-center gap-3 rounded-2xl border border-acento/50 bg-acento/10 hover:bg-acento/15 p-4 text-left transition"
          >
            <div className="w-11 h-11 rounded-xl bg-acento/20 flex items-center justify-center shrink-0">
              <Plus size={22} className="text-acento" />
            </div>
            <div className="min-w-0">
              <p className="text-white font-semibold">Criar festa</p>
              <p className="text-gray-400 text-xs">Você escolhe as lojas e o endereço</p>
            </div>
          </button>

          <form onSubmit={entrar} className="rounded-2xl border border-borda bg-card p-4">
            <label className="text-gray-300 text-sm font-medium mb-2 flex items-center gap-1.5">
              <Ticket size={14} className="text-gray-500" /> Entrar com código
            </label>
            <div className="flex gap-2">
              <input
                value={codigo}
                onChange={e => setCodigo(normalizarCodigo(e.target.value))}
                placeholder="Ex: K7QP2M"
                maxLength={8}
                className="flex-1 min-w-0 bg-superficie border border-borda text-white rounded-xl px-3 py-2.5 outline-none focus:border-acento/60 text-sm tracking-widest font-mono uppercase"
              />
              <button
                type="submit"
                disabled={entrando}
                className="shrink-0 bg-azul hover:brightness-110 disabled:opacity-50 text-white font-semibold px-4 rounded-xl transition"
              >
                {entrando ? '...' : 'Entrar'}
              </button>
            </div>
          </form>
        </div>

        {/* Minhas festas */}
        <h2 className="font-display text-white font-semibold text-lg mb-3">Minhas festas</h2>
        {carregando ? (
          <p className="text-gray-500 text-sm py-8 text-center">Carregando...</p>
        ) : festas.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-borda bg-card/50 py-10 text-center">
            <PartyPopper size={32} className="text-gray-600 mx-auto mb-2" />
            <p className="text-gray-400 text-sm">Você ainda não está em nenhuma festa.</p>
            <p className="text-gray-600 text-xs mt-1">Crie uma ou entre com o código de um convite.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {festas.map(f => {
              const meta = FESTA_STATUS_META[f.status]
              return (
                <button
                  key={f.id}
                  onClick={() => router.push(`/cliente/festa/${f.id}`)}
                  className="flex items-center gap-3 rounded-2xl border border-borda bg-card hover:border-acento/40 p-4 text-left transition"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {f.sou_criador && <Crown size={14} className="text-[#F5C34B] shrink-0" />}
                      <p className="text-white font-semibold truncate">{f.nome}</p>
                      <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full border ${meta.classes}`}>
                        {meta.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                      <span className="flex items-center gap-1"><Users size={12} /> {f.participantes}</span>
                      <span className="font-mono tracking-wider">{f.codigo}</span>
                      {f.meus_itens > 0 && <span className="text-acento">{f.meus_itens} item(ns) seu(s)</span>}
                    </div>
                  </div>
                  <ArrowRight size={18} className="text-gray-600 shrink-0" />
                </button>
              )
            })}
          </div>
        )}
      </div>

      {criar && (
        <CriarFestaModal
          onFechar={() => setCriar(false)}
          onCriada={(id) => { setCriar(false); router.push(`/cliente/festa/${id}`) }}
          onErro={(msg) => mostrarToast(msg, 'erro')}
        />
      )}
    </ClienteLayout>
  )
}
