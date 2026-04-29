'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useCliente } from '../../hooks/useCliente'
import { Search, MapPin, Phone, LogOut } from 'lucide-react'

const TIPOS = ['Todos', 'Barbearia', 'Distribuidora de bebidas', 'Mercado', 'Loja de roupas', 'Lanchonete', 'Salão de beleza', 'Eletrônicos', 'Outro']

export default function ClienteBuscar() {
  const { cliente, loading, supabase, sair } = useCliente()
  const [lojas, setLojas] = useState<any[]>([])
  const [busca, setBusca] = useState('')
  const [tipoFiltro, setTipoFiltro] = useState('Todos')
  const [buscando, setBuscando] = useState(false)
  const router = useRouter()

  useEffect(() => {
    if (cliente) buscarLojas()
  }, [cliente, tipoFiltro])

  async function buscarLojas() {
    setBuscando(true)
    let query = supabase
      .from('lojas')
      .select('id, nome, tipo, localizacao, telefone, instagram, horario')
      .order('created_at', { ascending: false })
      .limit(50)

    if (tipoFiltro !== 'Todos') query = query.eq('tipo', tipoFiltro)
    if (busca.trim()) query = query.ilike('nome', `%${busca.trim()}%`)

    const { data } = await query
    setLojas(data || [])
    setBuscando(false)
  }

  function handleBusca(e: React.FormEvent) {
    e.preventDefault()
    buscarLojas()
  }

  if (loading) return (
    <main className="min-h-screen bg-gray-950 flex items-center justify-center">
      <p className="text-gray-400">Carregando...</p>
    </main>
  )
  if (!cliente) return null

  return (
    <main className="min-h-screen bg-gray-950">
      <header className="bg-gray-900 border-b border-gray-800 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <div>
          <p className="text-xs text-green-400 font-semibold">Área do Cliente</p>
          <p className="text-white font-bold">Olá, {cliente.nome}!</p>
        </div>
        <button onClick={sair} className="text-gray-400 hover:text-white transition">
          <LogOut size={20} />
        </button>
      </header>

      <div className="max-w-2xl mx-auto p-4">
        <h1 className="text-2xl font-bold text-white mb-4">Descobrir comércios</h1>

        <form onSubmit={handleBusca} className="flex gap-2 mb-4">
          <div className="flex-1 relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              placeholder="Buscar por nome..."
              value={busca}
              onChange={e => setBusca(e.target.value)}
              className="w-full bg-gray-900 text-white rounded-xl pl-9 pr-4 py-3 outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          <button type="submit" className="bg-green-600 hover:bg-green-700 text-white px-4 rounded-xl transition">
            Buscar
          </button>
        </form>

        <div className="flex gap-2 overflow-x-auto pb-2 mb-6 scrollbar-hide">
          {TIPOS.map(t => (
            <button
              key={t}
              onClick={() => setTipoFiltro(t)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition ${tipoFiltro === t ? 'bg-green-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
            >
              {t}
            </button>
          ))}
        </div>

        {buscando ? (
          <div className="text-center py-12 text-gray-500">Buscando...</div>
        ) : lojas.length === 0 ? (
          <div className="text-center py-12 text-gray-500">Nenhum comércio encontrado.</div>
        ) : (
          <div className="flex flex-col gap-3">
            {lojas.map(loja => (
              <button
                key={loja.id}
                onClick={() => router.push(`/cliente/loja/${loja.id}`)}
                className="bg-gray-900 rounded-2xl p-4 text-left hover:bg-gray-800 transition"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-semibold">{loja.nome}</p>
                    <span className="inline-block text-xs bg-gray-800 text-gray-300 px-2 py-0.5 rounded-full mt-1 mb-2">{loja.tipo}</span>
                    {loja.localizacao && (
                      <p className="text-gray-400 text-sm flex items-center gap-1">
                        <MapPin size={12} />
                        {loja.localizacao}
                      </p>
                    )}
                    {loja.telefone && (
                      <p className="text-gray-400 text-sm flex items-center gap-1 mt-0.5">
                        <Phone size={12} />
                        {loja.telefone}
                      </p>
                    )}
                  </div>
                  <span className="text-green-400 text-sm font-medium shrink-0">Ver →</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
