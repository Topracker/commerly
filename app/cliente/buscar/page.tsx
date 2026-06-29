'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useCliente } from '../../hooks/useCliente'
import { ClienteLayout } from '../../components/ClienteLayout'
import { getRatingsPorLoja } from '../../lib/avaliacoes'
import { Search, MapPin, Phone, Star } from 'lucide-react'

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
      .from('lojas_publicas')
      .select('id, nome, tipo, localizacao, telefone, instagram, horario')
      .order('nome', { ascending: true })
      .limit(50)

    if (tipoFiltro !== 'Todos') query = query.eq('tipo', tipoFiltro)
    if (busca.trim()) query = query.ilike('nome', `%${busca.trim()}%`)

    const { data, error } = await query
    if (error) console.error('[buscar] lojas_publicas error:', error)

    const base = data || []
    const ratings = await getRatingsPorLoja(supabase, base.map(l => l.id))
    const comNota = base.map(l => ({
      ...l,
      media: ratings[l.id]?.media ?? 0,
      totalAval: ratings[l.id]?.total ?? 0,
    }))
    // Maior nota primeiro; empate vai pra quem tem mais avaliações, depois nome.
    comNota.sort((a, b) =>
      b.media - a.media || b.totalAval - a.totalAval || a.nome.localeCompare(b.nome),
    )

    setLojas(comNota)
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
    <ClienteLayout cliente={cliente} sair={sair}>
      <h1 className="text-2xl font-bold text-white mb-4 hidden md:block">Descobrir comércios</h1>

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
        <div className="flex flex-col gap-3 max-w-2xl mx-auto">
          {lojas.map(loja => (
            <button
              key={loja.id}
              onClick={() => router.push(`/cliente/loja/${loja.id}`)}
              className="bg-gray-900 rounded-2xl p-4 text-left hover:bg-gray-800 transition"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-white font-semibold">{loja.nome}</p>
                    {loja.totalAval > 0 && (
                      <span className="inline-flex items-center gap-1 text-xs bg-yellow-500/15 text-yellow-400 px-2 py-0.5 rounded-full font-medium">
                        <Star size={11} className="fill-yellow-400" />
                        {loja.media.toFixed(1)}
                        <span className="text-yellow-400/60">({loja.totalAval})</span>
                      </span>
                    )}
                  </div>
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
    </ClienteLayout>
  )
}
