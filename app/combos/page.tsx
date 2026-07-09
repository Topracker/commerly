'use client'
import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import { AppLayout } from '../components/AppLayout'
import { Toast } from '../components/Toast'
import { isDelivery } from '../lib/pedidosClientes'
import { Layers, Plus, Trash2, Lightbulb } from 'lucide-react'
import {
  DESCONTO_PADRAO, MIN_VEZES_JUNTOS, cestaDoPedido, contarPares, sugerirCombos,
  type ProdutoRef, type Sugestao,
} from '../lib/combos'

type Combo = {
  id: string
  nome: string
  produto_ids: string[]
  desconto_pct: number
  preco: number
  vezes_juntos: number
}

const DIAS_ANALISE = 90
const reais = (v: number) => `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`

export default function Combos() {
  const { loja, loading, supabase, sair } = useAuth()
  const { toast, mostrarToast } = useToast()

  const [cestas, setCestas] = useState<string[][]>([])
  const [produtos, setProdutos] = useState<ProdutoRef[]>([])
  const [combos, setCombos] = useState<Combo[]>([])
  const [desconto, setDesconto] = useState(DESCONTO_PADRAO)
  const [carregando, setCarregando] = useState(true)
  const [publicando, setPublicando] = useState<string | null>(null)

  useEffect(() => { if (loja) carregar() }, [loja])

  async function carregar() {
    setCarregando(true)
    const desde = new Date(Date.now() - DIAS_ANALISE * 86_400_000).toISOString()
    const [pedidosRes, produtosRes, combosRes] = await Promise.all([
      supabase.from('pedidos_clientes').select('itens').eq('loja_id', loja.id)
        .neq('status', 'cancelado').gte('created_at', desde),
      supabase.from('produtos').select('id, nome, preco_venda').eq('loja_id', loja.id),
      supabase.from('combos').select('id, nome, produto_ids, desconto_pct, preco, vezes_juntos')
        .eq('loja_id', loja.id).eq('ativo', true).order('created_at', { ascending: false }),
    ])
    setCestas((pedidosRes.data || []).map(p => cestaDoPedido(p.itens)).filter(c => c.length >= 2))
    setProdutos((produtosRes.data || []) as ProdutoRef[])
    setCombos((combosRes.data || []) as Combo[])
    setCarregando(false)
  }

  // Chave de um combo já publicado, pra não sugerir de novo o mesmo par.
  const chave = (ids: string[]) => [...ids].sort().join('|')
  const publicados = useMemo(() => new Set(combos.map(c => chave(c.produto_ids))), [combos])

  const sugestoes = useMemo(() => {
    const pares = contarPares(cestas)
    return sugerirCombos(pares, produtos, desconto).filter(s => !publicados.has(chave(s.produtoIds)))
  }, [cestas, produtos, desconto, publicados])

  async function publicar(s: Sugestao) {
    setPublicando(s.nome)
    const { data, error } = await supabase.from('combos').insert({
      loja_id: loja.id,
      nome: s.nome,
      produto_ids: s.produtoIds,
      desconto_pct: desconto,
      preco: s.precoCombo,
      vezes_juntos: s.vezes,
    }).select('id, nome, produto_ids, desconto_pct, preco, vezes_juntos').single()
    setPublicando(null)
    if (error) return mostrarToast('Erro ao publicar o combo', 'erro')
    setCombos(c => [data as Combo, ...c])
    mostrarToast('Combo publicado!', 'sucesso')
  }

  async function remover(id: string) {
    const { error } = await supabase.from('combos').update({ ativo: false }).eq('id', id)
    if (error) return mostrarToast('Erro ao remover', 'erro')
    setCombos(c => c.filter(x => x.id !== id))
  }

  if (loading) return (
    <main className="min-h-screen bg-gray-950 flex items-center justify-center"><p className="text-gray-400">Carregando...</p></main>
  )
  if (!loja) return null

  return (
    <AppLayout loja={loja} sair={sair} titulo="Combos inteligentes" maxWidth="max-w-3xl">
      <Toast toast={toast} />

      {!isDelivery(loja.tipo) && (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 mb-4">
          <p className="text-gray-400 text-xs">
            As sugestões vêm dos pedidos feitos pelo app (delivery). Seu segmento não recebe pedidos online,
            então você ainda pode criar combos manualmente ligando o delivery nas configurações.
          </p>
        </div>
      )}

      {/* Desconto do combo */}
      <div className="bg-gray-900 rounded-2xl p-5 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <Lightbulb size={16} className="text-amber-300" />
          <p className="text-white font-semibold text-sm">Como funciona</p>
        </div>
        <p className="text-gray-500 text-xs mb-4">
          Analisamos os últimos {DIAS_ANALISE} dias de pedidos. Quando dois produtos aparecem juntos
          em pelo menos {MIN_VEZES_JUNTOS} pedidos, viram uma sugestão de combo.
        </p>
        <label className="text-gray-400 text-xs">Desconto do combo (%)</label>
        <input
          type="number" min={1} max={90} value={desconto}
          onChange={e => setDesconto(Math.min(90, Math.max(1, Number(e.target.value) || 1)))}
          className="w-full mt-1 bg-gray-800 text-white rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-500 text-sm"
        />
      </div>

      {/* Sugestões */}
      <div className="bg-gray-900 rounded-2xl p-5 mb-4">
        <p className="text-white font-semibold mb-4">Sugestões ({sugestoes.length})</p>
        {carregando ? (
          <p className="text-gray-500 text-sm">Analisando pedidos...</p>
        ) : sugestoes.length === 0 ? (
          <p className="text-gray-500 text-sm">
            Nenhum padrão encontrado ainda. Assim que os clientes começarem a levar os mesmos
            produtos juntos, as sugestões aparecem aqui.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {sugestoes.slice(0, 10).map(s => (
              <div key={s.nome} className="bg-gray-950/50 border border-gray-800 rounded-xl p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-white text-sm font-semibold truncate">{s.nome}</p>
                    <p className="text-gray-500 text-xs mt-0.5">
                      Comprados juntos {s.vezes}x · {Math.round(s.confianca * 100)}% de confiança
                    </p>
                    <p className="text-xs mt-1">
                      <span className="text-gray-500 line-through mr-1.5">{reais(s.precoCheio)}</span>
                      <span className="text-green-400 font-semibold">{reais(s.precoCombo)}</span>
                      <span className="text-gray-600 ml-2">economiza {reais(s.economia)}</span>
                    </p>
                  </div>
                  <button
                    onClick={() => publicar(s)}
                    disabled={publicando === s.nome}
                    className="shrink-0 flex items-center gap-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold px-3 py-2 rounded-lg transition"
                  >
                    <Plus size={13} /> Publicar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Publicados */}
      <div className="bg-gray-900 rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Layers size={16} className="text-blue-400" />
          <p className="text-white font-semibold">Combos publicados ({combos.length})</p>
        </div>
        {combos.length === 0 ? (
          <p className="text-gray-500 text-sm">Nenhum combo publicado ainda.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {combos.map(c => (
              <div key={c.id} className="flex items-center gap-3 bg-gray-950/50 border border-gray-800 rounded-xl p-3">
                <span className="shrink-0 text-xs font-bold bg-blue-500/15 text-blue-300 border border-blue-500/40 px-2 py-1 rounded-lg">
                  -{c.desconto_pct}%
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm truncate">{c.nome}</p>
                  <p className="text-gray-500 text-xs">
                    <span className="text-green-400 font-semibold">{reais(c.preco)}</span>
                    <span className="ml-2">visto junto {c.vezes_juntos}x</span>
                  </p>
                </div>
                <button onClick={() => remover(c.id)} className="shrink-0 text-gray-500 hover:text-red-400 transition" title="Remover combo">
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  )
}
