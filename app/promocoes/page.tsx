'use client'
import { useEffect, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import { AppLayout } from '../components/AppLayout'
import { Toast } from '../components/Toast'
import { Tag, Zap, Trash2, Package } from 'lucide-react'
import {
  DIA_MS, REGRA_PADRAO, precoComDesconto, produtosElegiveis, produtoIdsDosItens,
  type Elegivel, type ProdutoBase, type Regra,
} from '../lib/promocoes'

type PromocaoAtiva = {
  id: string
  produto_id: string
  desconto_pct: number
  preco_original: number
  preco_promocional: number
  origem: string
  produtos: { nome: string } | null
}

const reais = (v: number) => `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`

export default function Promocoes() {
  const { loja, loading, supabase, sair } = useAuth()
  const { toast, mostrarToast } = useToast()

  const [regra, setRegra] = useState<Regra>(REGRA_PADRAO)
  const [ativas, setAtivas] = useState<PromocaoAtiva[]>([])
  const [elegiveis, setElegiveis] = useState<Elegivel[]>([])
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [aplicando, setAplicando] = useState(false)

  useEffect(() => { if (loja) carregar() }, [loja])
  // A prévia depende dos parâmetros da regra: recalcula quando o comerciante mexe.
  useEffect(() => { if (loja) calcularPrevia() }, [loja, regra.dias_sem_venda, regra.desconto_pct])

  async function carregar() {
    setCarregando(true)
    const [regraRes, ativasRes] = await Promise.all([
      supabase.from('promocao_regras').select('ativa, dias_sem_venda, desconto_pct').eq('loja_id', loja.id).maybeSingle(),
      supabase.from('promocoes').select('id, produto_id, desconto_pct, preco_original, preco_promocional, origem, produtos(nome)')
        .eq('loja_id', loja.id).eq('ativa', true).order('created_at', { ascending: false }),
    ])
    if (regraRes.data) setRegra(regraRes.data)
    setAtivas((ativasRes.data || []) as unknown as PromocaoAtiva[])
    setCarregando(false)
  }

  // Mesma lógica da rota /api/promocoes/aplicar, só que sem gravar nada.
  async function calcularPrevia() {
    const desde = new Date(Date.now() - regra.dias_sem_venda * DIA_MS).toISOString()
    const [produtosRes, vendasRes, pedidosRes] = await Promise.all([
      supabase.from('produtos').select('id, nome, preco_venda, quantidade, created_at').eq('loja_id', loja.id),
      supabase.from('vendas').select('produto_id').eq('loja_id', loja.id).gte('created_at', desde),
      supabase.from('pedidos_clientes').select('itens').eq('loja_id', loja.id).neq('status', 'cancelado').gte('created_at', desde),
    ])
    const vendidos = new Set<string>()
    for (const v of vendasRes.data || []) if (v.produto_id) vendidos.add(v.produto_id as string)
    for (const p of pedidosRes.data || []) for (const id of produtoIdsDosItens(p.itens)) vendidos.add(id)
    setElegiveis(produtosElegiveis((produtosRes.data || []) as ProdutoBase[], vendidos, regra))
  }

  async function salvarRegra(nova: Regra) {
    setRegra(nova)
    setSalvando(true)
    const { error } = await supabase.from('promocao_regras')
      .upsert({ loja_id: loja.id, ...nova, updated_at: new Date().toISOString() }, { onConflict: 'loja_id' })
    setSalvando(false)
    if (error) mostrarToast('Erro ao salvar a regra', 'erro')
  }

  async function aplicarAgora() {
    if (!regra.ativa) return mostrarToast('Ative a regra primeiro', 'erro')
    setAplicando(true)
    const res = await fetch('/api/promocoes/aplicar', { method: 'POST' })
    const data = await res.json()
    setAplicando(false)
    if (!res.ok) return mostrarToast(data.erro || 'Falha ao aplicar', 'erro')
    mostrarToast(`${data.criadas} promoção(ões) criada(s), ${data.encerradas} encerrada(s)`, 'sucesso')
    carregar()
    calcularPrevia()
  }

  async function encerrar(id: string) {
    const { error } = await supabase.from('promocoes').update({ ativa: false }).eq('id', id)
    if (error) return mostrarToast('Erro ao encerrar', 'erro')
    setAtivas(a => a.filter(p => p.id !== id))
    calcularPrevia()
  }

  if (loading) return (
    <main className="min-h-screen bg-gray-950 flex items-center justify-center"><p className="text-gray-400">Carregando...</p></main>
  )
  if (!loja) return null

  const jaPromovidos = new Set(ativas.map(a => a.produto_id))
  const previaNova = elegiveis.filter(e => !jaPromovidos.has(e.id))

  return (
    <AppLayout loja={loja} sair={sair} titulo="Promoções automáticas" maxWidth="max-w-3xl">
      <Toast toast={toast} />

      {/* Regra */}
      <div className="bg-gray-900 rounded-2xl p-5 mb-4">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <p className="text-white font-semibold">Regra automática</p>
            <p className="text-gray-500 text-xs mt-0.5">
              Produto parado há <strong className="text-gray-300">{regra.dias_sem_venda} dias</strong> recebe{' '}
              <strong className="text-gray-300">{regra.desconto_pct}%</strong> de desconto.
            </p>
          </div>
          <button
            onClick={() => salvarRegra({ ...regra, ativa: !regra.ativa })}
            disabled={salvando}
            className={`shrink-0 w-12 h-7 rounded-full transition relative ${regra.ativa ? 'bg-green-500' : 'bg-gray-700'}`}
            aria-label={regra.ativa ? 'Desativar regra' : 'Ativar regra'}
          >
            <span className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-all ${regra.ativa ? 'left-6' : 'left-1'}`} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-gray-400 text-xs">Dias sem vender</label>
            <input
              type="number" min={1} max={365} value={regra.dias_sem_venda}
              onChange={e => setRegra({ ...regra, dias_sem_venda: Number(e.target.value) })}
              onBlur={() => salvarRegra(regra)}
              className="w-full mt-1 bg-gray-800 text-white rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </div>
          <div>
            <label className="text-gray-400 text-xs">Desconto (%)</label>
            <input
              type="number" min={1} max={90} value={regra.desconto_pct}
              onChange={e => setRegra({ ...regra, desconto_pct: Number(e.target.value) })}
              onBlur={() => salvarRegra(regra)}
              className="w-full mt-1 bg-gray-800 text-white rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </div>
        </div>

        <button
          onClick={aplicarAgora}
          disabled={aplicando || !regra.ativa}
          className="w-full mt-4 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-xl transition"
        >
          <Zap size={15} /> {aplicando ? 'Aplicando...' : 'Aplicar agora'}
        </button>
      </div>

      {/* Prévia */}
      {previaNova.length > 0 && (
        <div className="bg-amber-950/40 border border-amber-900/60 rounded-2xl p-5 mb-4">
          <p className="text-amber-200 font-semibold text-sm mb-1">
            {previaNova.length} produto(s) entrariam em promoção agora
          </p>
          <p className="text-amber-100/60 text-xs mb-3">Com estoque e sem vender há {regra.dias_sem_venda} dias ou mais.</p>
          <div className="flex flex-col gap-2">
            {previaNova.slice(0, 8).map(p => (
              <div key={p.id} className="flex items-center justify-between text-sm">
                <span className="text-gray-300 truncate">{p.nome} <span className="text-gray-600">· {p.diasParado}d</span></span>
                <span className="shrink-0 text-xs">
                  <span className="text-gray-500 line-through mr-1.5">{reais(p.preco_venda)}</span>
                  <span className="text-green-400 font-semibold">{reais(p.precoPromocional)}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Ativas */}
      <div className="bg-gray-900 rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Tag size={16} className="text-green-400" />
          <p className="text-white font-semibold">Promoções ativas ({ativas.length})</p>
        </div>

        {carregando ? (
          <p className="text-gray-500 text-sm">Carregando...</p>
        ) : ativas.length === 0 ? (
          <div className="text-center py-6">
            <Package size={36} className="text-gray-700 mx-auto mb-2" />
            <p className="text-gray-500 text-sm">Nenhuma promoção ativa.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {ativas.map(p => (
              <div key={p.id} className="flex items-center gap-3 bg-gray-950/50 border border-gray-800 rounded-xl p-3">
                <span className="shrink-0 text-xs font-bold bg-green-500/15 text-green-300 border border-green-500/40 px-2 py-1 rounded-lg">
                  -{p.desconto_pct}%
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm truncate">{p.produtos?.nome || 'Produto'}</p>
                  <p className="text-xs">
                    <span className="text-gray-500 line-through mr-1.5">{reais(p.preco_original)}</span>
                    <span className="text-green-400 font-semibold">{reais(p.preco_promocional)}</span>
                    <span className="text-gray-600 ml-2">{p.origem === 'automatica' ? 'automática' : 'manual'}</span>
                  </p>
                </div>
                <button onClick={() => encerrar(p.id)} className="shrink-0 text-gray-500 hover:text-red-400 transition" title="Encerrar promoção">
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="text-gray-600 text-xs mt-4">
        O preço promocional aparece para os clientes na página da sua loja e no cardápio.
      </p>
    </AppLayout>
  )
}
