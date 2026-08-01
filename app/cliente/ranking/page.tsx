'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useCliente } from '../../hooks/useCliente'
import { ClienteLayout } from '../../components/ClienteLayout'
import { getRatingsPorLoja } from '../../lib/avaliacoes'
import { Trophy, Star, MapPin } from 'lucide-react'

type LojaRank = {
  id: string
  nome: string
  tipo: string
  localizacao: string | null
  media: number
  totalAval: number
}

export default function ClienteRanking() {
  const { cliente, loading, supabase, sair } = useCliente()
  const [lojas, setLojas] = useState<LojaRank[]>([])
  const [carregando, setCarregando] = useState(true)
  const router = useRouter()

  useEffect(() => {
    if (cliente) carregarRanking()
  }, [cliente])

  async function carregarRanking() {
    setCarregando(true)

    // Agrega todas as avaliações e fica com as 10 lojas de maior média.
    const ratings = await getRatingsPorLoja(supabase)
    const top = Object.entries(ratings)
      .map(([id, r]) => ({ id, media: r.media, totalAval: r.total }))
      .sort((a, b) => b.media - a.media || b.totalAval - a.totalAval)
      .slice(0, 10)

    if (top.length === 0) { setLojas([]); setCarregando(false); return }

    const ids = top.map(t => t.id)
    const { data } = await supabase
      .from('lojas_publicas')
      .select('id, nome, tipo, localizacao')
      .in('id', ids)

    const detalhes = new Map((data || []).map((l: any) => [l.id, l]))
    const ranqueadas = top
      .map(t => {
        const d = detalhes.get(t.id)
        if (!d) return null
        return { ...d, media: t.media, totalAval: t.totalAval } as LojaRank
      })
      .filter((l): l is LojaRank => l !== null)

    setLojas(ranqueadas)
    setCarregando(false)
  }

  if (loading) return (
    <main className="min-h-screen bg-gray-950 flex items-center justify-center">
      <p className="text-gray-400">Carregando...</p>
    </main>
  )
  if (!cliente) return null

  const medalha = (i: number) => (i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}º`)

  return (
    <ClienteLayout cliente={cliente} sair={sair}>
      <div className="flex items-center gap-2 mb-6">
        <Trophy size={24} className="text-yellow-400" />
        <h1 className="text-2xl font-bold text-white">Top 10 mais bem avaliadas</h1>
      </div>

      {carregando ? (
        <div className="text-center py-12 text-gray-500">Carregando ranking...</div>
      ) : lojas.length === 0 ? (
        <div className="bg-gray-900 rounded-2xl p-10 text-center max-w-2xl mx-auto">
          <Trophy size={32} className="mx-auto mb-3 text-gray-600" />
          <p className="text-gray-500">Nenhuma loja avaliada ainda.</p>
          <p className="text-gray-600 text-sm mt-1">Avalie comércios para o ranking começar a aparecer aqui.</p>
          <button
            onClick={() => router.push('/cliente/buscar')}
            className="mt-4 bg-green-600 hover:bg-green-700 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition"
          >
            Descobrir comércios
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3 max-w-2xl mx-auto">
          {lojas.map((loja, i) => (
            <button
              key={loja.id}
              onClick={() => router.push(`/cliente/loja/${loja.id}`)}
              className={`rounded-2xl p-4 text-left transition flex items-center gap-4 ${i < 3 ? 'bg-yellow-500/10 hover:bg-yellow-500/20' : 'bg-gray-900 hover:bg-gray-800'}`}
            >
              <span className="text-xl w-9 text-center shrink-0 font-bold text-gray-300">{medalha(i)}</span>
              <div className="flex-1 min-w-0">
                <p className="text-white font-semibold truncate">{loja.nome}</p>
                <span className="inline-block text-xs bg-gray-800 text-gray-300 px-2 py-0.5 rounded-full mt-1">{loja.tipo}</span>
                {loja.localizacao && (
                  <p className="text-gray-400 text-sm flex items-center gap-1 mt-1">
                    <MapPin size={12} />
                    {loja.localizacao}
                  </p>
                )}
              </div>
              <div className="text-right shrink-0">
                <div className="flex items-center gap-1 justify-end">
                  <Star size={14} className="fill-yellow-400 text-yellow-400" />
                  <span className="text-white font-bold">{loja.media.toFixed(1)}</span>
                </div>
                <p className="text-gray-500 text-xs">{loja.totalAval} avaliaç{loja.totalAval > 1 ? 'ões' : 'ão'}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </ClienteLayout>
  )
}
