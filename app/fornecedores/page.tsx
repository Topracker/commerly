'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '../hooks/useAuth'
import { AppLayout } from '../components/AppLayout'
import { Search, MapPin, Star } from 'lucide-react'

const CATEGORIAS = ['Todos', 'Alimentos e bebidas', 'Limpeza e higiene', 'Eletrônicos', 'Roupas e acessórios', 'Papelaria', 'Construção', 'Serviços', 'Tecnologia', 'Outro']

export default function BuscarFornecedores() {
  const { loja, loading, supabase, sair } = useAuth()
  const [fornecedores, setFornecedores] = useState<any[]>([])
  const [busca, setBusca] = useState('')
  const [categoria, setCategoria] = useState('Todos')
  const [buscando, setBuscando] = useState(false)
  const router = useRouter()

  useEffect(() => { if (loja) buscar() }, [loja, categoria])

  async function buscar() {
    setBuscando(true)
    let query = supabase
      .from('fornecedores')
      .select('id, nome, categoria, localizacao, telefone, instagram, descricao')
      .order('created_at', { ascending: false })
      .limit(50)

    if (categoria !== 'Todos') query = query.eq('categoria', categoria)
    if (busca.trim()) query = query.ilike('nome', `%${busca.trim()}%`)

    const { data } = await query
    setFornecedores(data || [])
    setBuscando(false)
  }

  function handleBusca(e: React.FormEvent) {
    e.preventDefault()
    buscar()
  }

  if (loading) return (
    <main className="min-h-screen bg-gray-950 flex items-center justify-center">
      <p className="text-gray-400">Carregando...</p>
    </main>
  )
  if (!loja) return null

  return (
    <AppLayout loja={loja} sair={sair} titulo="Buscar Fornecedores">
      <form onSubmit={handleBusca} className="flex gap-2 mb-4">
        <div className="flex-1 relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            placeholder="Buscar fornecedor..."
            value={busca}
            onChange={e => setBusca(e.target.value)}
            className="w-full bg-gray-900 text-white rounded-xl pl-9 pr-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white px-4 rounded-xl transition">
          Buscar
        </button>
      </form>

      <div className="flex gap-2 overflow-x-auto pb-2 mb-6">
        {CATEGORIAS.map(c => (
          <button
            key={c}
            onClick={() => setCategoria(c)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition ${categoria === c ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
          >
            {c}
          </button>
        ))}
      </div>

      {buscando ? (
        <div className="text-center py-12 text-gray-500">Buscando...</div>
      ) : fornecedores.length === 0 ? (
        <div className="text-center py-12 text-gray-500">Nenhum fornecedor encontrado.</div>
      ) : (
        <div className="flex flex-col gap-3">
          {fornecedores.map(f => (
            <button
              key={f.id}
              onClick={() => router.push(`/fornecedor/${f.id}`)}
              className="bg-gray-900 rounded-2xl p-4 text-left hover:bg-gray-800 transition"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-white font-semibold">{f.nome}</p>
                  <span className="inline-block text-xs bg-purple-900 text-purple-300 px-2 py-0.5 rounded-full mt-1 mb-2">{f.categoria}</span>
                  {f.descricao && <p className="text-gray-400 text-sm line-clamp-2">{f.descricao}</p>}
                  {f.localizacao && (
                    <p className="text-gray-500 text-xs flex items-center gap-1 mt-1"><MapPin size={11} />{f.localizacao}</p>
                  )}
                </div>
                <span className="text-purple-400 text-sm font-medium shrink-0">Ver →</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </AppLayout>
  )
}
