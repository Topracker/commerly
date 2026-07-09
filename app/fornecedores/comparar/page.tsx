'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '../../hooks/useAuth'
import { AppLayout } from '../../components/AppLayout'
import { Search, TrendingDown, Store, Scale } from 'lucide-react'
import { compararOfertas, normalizarNome, type OfertaFornecedor } from '../../lib/b2b'

const reais = (v: number) => `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`

export default function CompararFornecedores() {
  const { loja, loading, supabase, sair } = useAuth()
  const router = useRouter()
  const [ofertas, setOfertas] = useState<OfertaFornecedor[]>([])
  const [busca, setBusca] = useState('')
  const [carregando, setCarregando] = useState(true)

  useEffect(() => { if (loja) carregar() }, [loja])

  async function carregar() {
    setCarregando(true)
    const { data } = await supabase
      .from('fornecedor_produtos')
      .select('id, nome, preco, unidade, minimo_pedido, estoque, fornecedor_id, fornecedores(nome)')
      .eq('ativo', true)

    setOfertas((data || []).map((p: any) => ({
      produto_id: p.id,
      fornecedor_id: p.fornecedor_id,
      fornecedor_nome: p.fornecedores?.nome || 'Fornecedor',
      nome: p.nome,
      preco: Number(p.preco) || 0,
      unidade: p.unidade || 'un',
      minimo_pedido: Number(p.minimo_pedido) || 1,
      estoque: p.estoque == null ? null : Number(p.estoque),
    })))
    setCarregando(false)
  }

  const grupos = useMemo(() => {
    const todos = compararOfertas(ofertas)
    const q = normalizarNome(busca)
    return q ? todos.filter(g => g.chave.includes(q)) : todos
  }, [ofertas, busca])

  if (loading) return (
    <main className="min-h-screen bg-gray-950 flex items-center justify-center"><p className="text-gray-400">Carregando...</p></main>
  )
  if (!loja) return null

  return (
    <AppLayout loja={loja} sair={sair} titulo="Comparar preços" maxWidth="max-w-3xl">
      <div className="bg-gray-900 rounded-2xl p-4 mb-4">
        <div className="flex items-center gap-2 mb-2">
          <Scale size={16} className="text-blue-400" />
          <p className="text-white font-semibold text-sm">Mesmo produto, vários fornecedores</p>
        </div>
        <p className="text-gray-500 text-xs">
          Só aparecem produtos oferecidos por dois ou mais fornecedores. Ordenados pela maior economia.
        </p>
      </div>

      <div className="relative mb-4">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
        <input
          value={busca}
          onChange={e => setBusca(e.target.value)}
          placeholder="Buscar produto (ex: açúcar, coca-cola)"
          className="w-full bg-gray-900 text-white rounded-xl pl-9 pr-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-500 text-sm"
        />
      </div>

      {carregando ? (
        <p className="text-gray-500 text-sm">Carregando ofertas...</p>
      ) : grupos.length === 0 ? (
        <div className="bg-gray-900 rounded-2xl p-8 text-center">
          <Store size={40} className="text-gray-700 mx-auto mb-3" />
          <p className="text-gray-400 text-sm">
            {busca
              ? 'Nenhum produto encontrado com esse nome em mais de um fornecedor.'
              : 'Ainda não há produtos oferecidos por dois ou mais fornecedores para comparar.'}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {grupos.map(g => (
            <div key={g.chave} className="bg-gray-900 rounded-2xl p-5">
              <div className="flex items-start justify-between gap-3 mb-3">
                <p className="text-white font-semibold capitalize">{g.nome}</p>
                {g.economia > 0 && (
                  <span className="shrink-0 inline-flex items-center gap-1 text-xs bg-green-500/15 text-green-300 border border-green-500/40 px-2 py-1 rounded-lg font-semibold">
                    <TrendingDown size={12} /> economize {reais(g.economia)}
                  </span>
                )}
              </div>

              <div className="flex flex-col gap-2">
                {g.ofertas.map((o, i) => {
                  const maisBarato = i === 0 && g.economia > 0
                  return (
                    <button
                      key={`${o.fornecedor_id}-${o.produto_id}`}
                      onClick={() => router.push(`/fornecedor/${o.fornecedor_id}`)}
                      className={`w-full flex items-center gap-3 rounded-xl p-3 text-left transition border ${
                        maisBarato
                          ? 'bg-green-950/40 border-green-800 hover:border-green-600'
                          : 'bg-gray-950/50 border-gray-800 hover:border-gray-700'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm truncate">{o.fornecedor_nome}</p>
                        <p className="text-gray-500 text-xs">
                          mín. {o.minimo_pedido} {o.unidade}
                          {o.estoque != null && ` · ${o.estoque} em estoque`}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`font-bold text-sm ${maisBarato ? 'text-green-400' : 'text-gray-300'}`}>
                          {reais(o.preco)}
                        </p>
                        <p className="text-gray-600 text-xs">por {o.unidade}</p>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </AppLayout>
  )
}
