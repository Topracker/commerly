'use client'
import { useEffect, useState } from 'react'
import { Ban } from 'lucide-react'
import { listaBloqueados, desbloquear, aoMudarBloqueados, type ItemBloqueado, type TipoBloqueio } from '../lib/moderacao'

// Card "Bloqueados": lista quem o usuário bloqueou neste aparelho (lojas e
// clientes) e permite desfazer. Par do MenuDenuncia.
export function BloqueadosCard() {
  const [lista, setLista] = useState<{ tipo: TipoBloqueio; item: ItemBloqueado }[]>([])

  useEffect(() => {
    const carregar = () => {
      const l = listaBloqueados()
      setLista([
        ...l.loja.map(item => ({ tipo: 'loja' as const, item })),
        ...l.cliente.map(item => ({ tipo: 'cliente' as const, item })),
      ])
    }
    carregar()
    return aoMudarBloqueados(carregar)
  }, [])

  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-4">
      <p className="text-gray-200 text-sm font-semibold flex items-center gap-1.5">
        <Ban size={15} /> Bloqueados
      </p>
      {lista.length === 0 ? (
        <p className="text-gray-500 text-xs mt-1">Você não bloqueou ninguém. Use o menu ⋯ em posts, comentários ou conversas para denunciar ou bloquear.</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-1.5">
          {lista.map(({ tipo, item }) => (
            <li key={tipo + item.id} className="flex items-center justify-between gap-2 rounded-xl bg-gray-800/70 px-3 py-2 text-sm">
              <span className="truncate text-gray-300">
                {item.nome || (tipo === 'loja' ? 'Loja' : 'Usuário')}
                <span className="ml-1.5 text-xs text-gray-500">{tipo === 'loja' ? 'loja' : 'usuário'}</span>
              </span>
              <button onClick={() => desbloquear(tipo, item.id)} className="shrink-0 text-xs font-medium text-azul hover:underline">
                Desbloquear
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default BloqueadosCard
