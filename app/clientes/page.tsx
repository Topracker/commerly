'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import { AppLayout } from '../components/AppLayout'
import { Toast } from '../components/Toast'
import { UserRound, MessageCircle, ShoppingBag, TrendingUp, AlertTriangle, Search, Gift } from 'lucide-react'

type PedidoRow = {
  cliente_id: string
  cliente_nome: string | null
  cliente_telefone: string | null
  total: number | string
  status: string
  created_at: string
}

type ClienteCRM = {
  cliente_id: string
  nome: string
  telefone: string | null
  totalGasto: number
  pedidos: number
  ultimaCompra: string
  ticketMedio: number
  diasSemComprar: number
}

const reais = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
const DIAS_INATIVO = 30

export default function ClientesCRM() {
  const { loja, loading, supabase, sair } = useAuth()
  const { toast, mostrarToast } = useToast()
  const router = useRouter()
  const [clientes, setClientes] = useState<ClienteCRM[]>([])
  const [carregando, setCarregando] = useState(true)
  const [busca, setBusca] = useState('')
  const [soInativos, setSoInativos] = useState(false)
  const [enviando, setEnviando] = useState<string | null>(null)

  /**
   * Campanha de retorno: gera cupom e manda pelo chat + push.
   * Sem `clienteId`, dispara para todos os sumidos elegíveis (a rota respeita
   * um cooldown de 30 dias por cliente).
   */
  async function enviarCampanha(clienteId?: string) {
    setEnviando(clienteId ?? 'todos')
    try {
      const res = await fetch('/api/campanha-retorno', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(clienteId ? { cliente_ids: [clienteId] } : {}),
      })
      const data = await res.json()
      if (!res.ok) mostrarToast(data.erro || 'Falha ao enviar', 'erro')
      else if (data.enviados === 0) {
        mostrarToast(
          data.ignorados > 0
            ? `Nenhum envio: ${data.ignorados} cliente(s) já receberam cupom nos últimos 30 dias.`
            : 'Nenhum cliente elegível no momento.',
          'erro',
        )
      } else {
        mostrarToast(`🎁 Cupom enviado para ${data.enviados} cliente(s)!`, 'sucesso')
      }
    } catch {
      mostrarToast('Falha ao enviar', 'erro')
    }
    setEnviando(null)
  }

  useEffect(() => { if (loja) carregar() }, [loja])

  async function carregar() {
    setCarregando(true)
    // Todos os pedidos (exceto cancelados) da loja — a identidade do cliente
    // vem dos pedidos online (delivery). RLS: comerciante vê os da própria loja.
    const { data } = await supabase
      .from('pedidos_clientes')
      .select('cliente_id, cliente_nome, cliente_telefone, total, status, created_at')
      .eq('loja_id', loja.id)
      .neq('status', 'cancelado')
      .order('created_at', { ascending: false })

    const rows = (data || []) as PedidoRow[]
    const mapa = new Map<string, ClienteCRM>()
    const agora = Date.now()
    for (const r of rows) {
      if (!r.cliente_id) continue
      const total = Number(r.total) || 0
      const existente = mapa.get(r.cliente_id)
      if (existente) {
        existente.totalGasto += total
        existente.pedidos += 1
        // rows vêm em ordem decrescente -> a 1ª é a última compra.
      } else {
        mapa.set(r.cliente_id, {
          cliente_id: r.cliente_id,
          nome: r.cliente_nome || 'Cliente',
          telefone: r.cliente_telefone || null,
          totalGasto: total,
          pedidos: 1,
          ultimaCompra: r.created_at,
          ticketMedio: 0,
          diasSemComprar: 0,
        })
      }
    }
    const lista = [...mapa.values()].map(c => ({
      ...c,
      ticketMedio: c.pedidos > 0 ? c.totalGasto / c.pedidos : 0,
      diasSemComprar: Math.floor((agora - new Date(c.ultimaCompra).getTime()) / 86_400_000),
    }))
    lista.sort((a, b) => b.totalGasto - a.totalGasto)
    setClientes(lista)
    setCarregando(false)
  }

  const filtrados = useMemo(() => {
    let l = clientes
    if (soInativos) l = l.filter(c => c.diasSemComprar >= DIAS_INATIVO)
    const q = busca.trim().toLowerCase()
    if (q) l = l.filter(c => c.nome.toLowerCase().includes(q) || (c.telefone || '').includes(q))
    return l
  }, [clientes, busca, soInativos])

  const totais = useMemo(() => ({
    clientes: clientes.length,
    receita: clientes.reduce((s, c) => s + c.totalGasto, 0),
    inativos: clientes.filter(c => c.diasSemComprar >= DIAS_INATIVO).length,
  }), [clientes])

  if (loading) return (
    <main className="min-h-screen bg-gray-950 flex items-center justify-center"><p className="text-gray-400">Carregando...</p></main>
  )
  if (!loja) return null

  return (
    <AppLayout loja={loja} sair={sair} titulo="Clientes (CRM)" maxWidth="max-w-3xl">
      <Toast toast={toast} />

      {/* Resumo */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="bg-gray-900 rounded-2xl p-4">
          <div className="flex items-center gap-1.5 text-gray-400 text-xs mb-1"><UserRound size={13} /> Clientes</div>
          <p className="text-2xl font-bold text-white">{totais.clientes}</p>
        </div>
        <div className="bg-gray-900 rounded-2xl p-4">
          <div className="flex items-center gap-1.5 text-gray-400 text-xs mb-1"><TrendingUp size={13} /> Receita</div>
          <p className="text-2xl font-bold text-green-400">{reais(totais.receita)}</p>
        </div>
        <div className="bg-gray-900 rounded-2xl p-4">
          <div className="flex items-center gap-1.5 text-gray-400 text-xs mb-1"><AlertTriangle size={13} /> Sumidos</div>
          <p className="text-2xl font-bold text-red-400">{totais.inativos}</p>
        </div>
      </div>

      {/* Campanha de retorno */}
      {totais.inativos > 0 && (
        <div className="bg-purple-950/40 border border-purple-900/60 rounded-2xl p-4 mb-5 flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-500/15 flex items-center justify-center shrink-0">
            <Gift size={18} className="text-purple-300" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-purple-200 font-semibold text-sm">Campanha de retorno</p>
            <p className="text-purple-100/60 text-xs mt-0.5">
              {totais.inativos} cliente(s) sem comprar há {DIAS_INATIVO}+ dias. Mande um cupom de 15% pelo chat.
            </p>
          </div>
          <button
            onClick={() => enviarCampanha()}
            disabled={enviando !== null}
            className="shrink-0 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-xs font-semibold px-3 py-2 rounded-lg transition"
          >
            {enviando === 'todos' ? 'Enviando...' : 'Enviar pra todos'}
          </button>
        </div>
      )}

      {/* Busca + filtro */}
      <div className="flex items-center gap-2 mb-4">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar cliente por nome ou telefone"
            className="w-full bg-gray-900 text-white rounded-xl pl-9 pr-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          />
        </div>
        <button
          onClick={() => setSoInativos(v => !v)}
          className={`shrink-0 px-3 py-2.5 rounded-xl text-sm font-semibold transition border ${soInativos ? 'bg-red-500/15 border-red-500/40 text-red-300' : 'bg-gray-900 border-gray-800 text-gray-400 hover:text-white'}`}
        >
          Sumidos 30d+
        </button>
      </div>

      {carregando ? (
        <p className="text-gray-500 text-sm">Carregando...</p>
      ) : clientes.length === 0 ? (
        <div className="bg-gray-900 rounded-2xl p-8 text-center">
          <ShoppingBag size={40} className="text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400 text-sm">Ainda não há clientes com pedidos. Quando alguém comprar pela sua loja, aparece aqui.</p>
        </div>
      ) : filtrados.length === 0 ? (
        <p className="text-gray-500 text-sm">Nenhum cliente encontrado com esse filtro.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {filtrados.map(c => {
            const inativo = c.diasSemComprar >= DIAS_INATIVO
            return (
              <div
                key={c.cliente_id}
                className={`rounded-2xl p-4 border ${inativo ? 'bg-red-950/40 border-red-900/60' : 'bg-gray-900 border-gray-800'}`}
              >
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${inativo ? 'bg-red-500/15' : 'bg-blue-500/15'}`}>
                    <UserRound size={18} className={inativo ? 'text-red-300' : 'text-blue-300'} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-white font-semibold truncate">{c.nome}</p>
                      {inativo && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-500/15 text-red-300 border border-red-500/40">
                          Sumido há {c.diasSemComprar}d
                        </span>
                      )}
                    </div>
                    {c.telefone && <p className="text-gray-500 text-xs">{c.telefone}</p>}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2.5">
                      <div>
                        <p className="text-gray-500 text-[11px]">Total gasto</p>
                        <p className="text-green-400 font-bold text-sm">{reais(c.totalGasto)}</p>
                      </div>
                      <div>
                        <p className="text-gray-500 text-[11px]">Pedidos</p>
                        <p className="text-white font-bold text-sm">{c.pedidos}</p>
                      </div>
                      <div>
                        <p className="text-gray-500 text-[11px]">Ticket médio</p>
                        <p className="text-white font-bold text-sm">{reais(c.ticketMedio)}</p>
                      </div>
                      <div>
                        <p className="text-gray-500 text-[11px]">Última compra</p>
                        <p className={`font-bold text-sm ${inativo ? 'text-red-300' : 'text-white'}`}>
                          {new Date(c.ultimaCompra).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => router.push(`/mensagens/cliente/${c.cliente_id}`)}
                    className="flex-1 flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold py-2.5 rounded-xl transition"
                  >
                    <MessageCircle size={15} /> Mensagem
                  </button>
                  {inativo && (
                    <button
                      onClick={() => enviarCampanha(c.cliente_id)}
                      disabled={enviando !== null}
                      className="flex-1 flex items-center justify-center gap-1.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-semibold py-2.5 rounded-xl transition"
                    >
                      <Gift size={15} /> {enviando === c.cliente_id ? 'Enviando...' : 'Enviar cupom'}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </AppLayout>
  )
}
