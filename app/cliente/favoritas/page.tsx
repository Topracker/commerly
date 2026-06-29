'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useCliente } from '../../hooks/useCliente'
import { useToast } from '../../hooks/useToast'
import { Toast } from '../../components/Toast'
import { ClienteLayout } from '../../components/ClienteLayout'
import { getFavoritos, removeFavorito, type LojaFavorita } from '../../lib/favoritos'
import { Heart, Store, X } from 'lucide-react'

export default function ClienteFavoritas() {
  const { cliente, loading, sair } = useCliente()
  const { toast, mostrarToast } = useToast()
  const router = useRouter()
  const [favoritas, setFavoritas] = useState<LojaFavorita[]>([])

  useEffect(() => {
    if (cliente) setFavoritas(getFavoritos())
  }, [cliente])

  function desfavoritar(id: string) {
    removeFavorito(id)
    setFavoritas(getFavoritos())
    mostrarToast('Removida dos favoritos', 'sucesso')
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
      <h1 className="text-2xl font-bold text-white mb-6 hidden md:block">Lojas favoritas</h1>

      {favoritas.length === 0 ? (
        <div className="bg-gray-900 rounded-2xl p-10 text-center max-w-2xl mx-auto">
          <Heart size={32} className="mx-auto mb-3 text-gray-600" />
          <p className="text-gray-500">Nenhuma loja favorita ainda.</p>
          <p className="text-gray-600 text-sm mt-1">Toque no coração de uma loja para salvá-la aqui.</p>
          <button
            onClick={() => router.push('/cliente/buscar')}
            className="mt-4 bg-green-600 hover:bg-green-700 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition"
          >
            Descobrir comércios
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3 max-w-2xl mx-auto">
          <p className="text-gray-400 text-sm">{favoritas.length} loja{favoritas.length !== 1 ? 's' : ''} favorita{favoritas.length !== 1 ? 's' : ''}</p>
          {favoritas.map(l => (
            <div key={l.id} className="bg-gray-900 rounded-2xl p-4 flex items-center gap-3">
              <button
                onClick={() => router.push(`/cliente/loja/${l.id}`)}
                className="flex-1 min-w-0 text-left flex items-center gap-3"
              >
                <div className="w-10 h-10 bg-green-900 rounded-full flex items-center justify-center shrink-0">
                  <Store size={18} className="text-green-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-white font-semibold truncate">{l.nome}</p>
                  {l.tipo && <p className="text-gray-500 text-xs">{l.tipo}</p>}
                </div>
              </button>
              <button
                onClick={() => desfavoritar(l.id)}
                title="Remover dos favoritos"
                className="text-gray-500 hover:text-red-400 transition shrink-0 p-1"
              >
                <X size={18} />
              </button>
            </div>
          ))}
        </div>
      )}
    </ClienteLayout>
  )
}
