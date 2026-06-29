'use client'
import { useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '../supabase'
import { Search, Heart, MessageCircle, User, LogOut, Menu, X, Trophy } from 'lucide-react'

const MENU = [
  { label: 'Buscar lojas', path: '/cliente/buscar', icon: Search },
  { label: 'Ranking', path: '/cliente/ranking', icon: Trophy },
  { label: 'Lojas favoritas', path: '/cliente/favoritas', icon: Heart },
  { label: 'Mensagens', path: '/cliente/mensagens', icon: MessageCircle },
  { label: 'Minha conta', path: '/cliente/dashboard', icon: User },
]

type Props = {
  cliente: any
  sair: () => Promise<void>
  children: React.ReactNode
  noPadding?: boolean
  fullHeight?: boolean
}

export function ClienteLayout({ cliente, sair, children, noPadding = false, fullHeight = false }: Props) {
  const [menuAberto, setMenuAberto] = useState(false)
  const [naoLidas, setNaoLidas] = useState(0)
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()

  useEffect(() => {
    if (!cliente?.id) return
    supabase
      .from('mensagens_clientes')
      .select('id', { count: 'exact', head: true })
      .eq('cliente_id', cliente.id)
      .eq('remetente', 'loja')
      .eq('lida', false)
      .then(({ count }) => setNaoLidas(count || 0))
  }, [cliente?.id, pathname])

  function navegar(path: string) {
    setMenuAberto(false)
    router.push(path)
  }

  const SidebarConteudo = () => (
    <div className="flex flex-col h-full p-4 gap-0.5">
      <div className="mb-4 px-2">
        <p className="text-xs text-green-400 font-semibold uppercase tracking-wide mb-1">Cliente</p>
        <p className="text-white font-bold text-lg truncate">{cliente.nome}</p>
      </div>
      {MENU.map(item => {
        const ativo = pathname === item.path ||
          (item.path === '/cliente/mensagens' && pathname.startsWith('/cliente/mensagens'))
        return (
          <button
            key={item.path}
            onClick={() => navegar(item.path)}
            className={`text-left px-3 py-2.5 rounded-xl transition flex items-center gap-3 ${ativo ? 'bg-green-600' : 'hover:bg-gray-800'}`}
          >
            <item.icon size={16} className={ativo ? 'text-white shrink-0' : 'text-gray-400 shrink-0'} />
            <p className="text-white text-sm font-medium flex-1">{item.label}</p>
            {item.label === 'Mensagens' && naoLidas > 0 && (
              <span className="bg-green-500 text-white text-xs rounded-full px-1.5 py-0.5 min-w-[20px] text-center font-bold shrink-0">
                {naoLidas}
              </span>
            )}
          </button>
        )
      })}
      <div className="mt-auto pt-2">
        <button
          onClick={sair}
          className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-gray-800 transition flex items-center gap-3 text-gray-400 text-sm"
        >
          <LogOut size={16} />
          Sair
        </button>
      </div>
    </div>
  )

  return (
    <div className={`${fullHeight ? 'h-screen overflow-hidden' : 'min-h-screen'} bg-gray-950 flex`}>
      <aside className="hidden md:flex w-56 bg-gray-900 flex-col fixed h-full z-10">
        <SidebarConteudo />
      </aside>

      {menuAberto && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="w-64 bg-gray-900 h-full overflow-y-auto">
            <div className="flex justify-end p-3">
              <button onClick={() => setMenuAberto(false)} className="text-gray-400 hover:text-white">
                <X size={24} />
              </button>
            </div>
            <SidebarConteudo />
          </div>
          <div className="flex-1 bg-black bg-opacity-50" onClick={() => setMenuAberto(false)} />
        </div>
      )}

      <main className={`md:ml-56 flex-1 ${fullHeight ? 'flex flex-col overflow-hidden' : noPadding ? '' : 'p-4 md:p-6'}`}>
        {fullHeight ? (
          <>
            <div className="md:hidden shrink-0 flex items-center gap-3 px-4 py-2 bg-gray-900 border-b border-gray-800">
              <button onClick={() => setMenuAberto(true)} className="text-white">
                <Menu size={22} />
              </button>
            </div>
            <div className="flex-1 overflow-hidden flex flex-col">
              {children}
            </div>
          </>
        ) : (
          <>
            <div className={`flex items-center gap-3 md:hidden ${noPadding ? 'px-4 pt-4 mb-4' : 'mb-4'}`}>
              <button onClick={() => setMenuAberto(true)} className="text-white">
                <Menu size={22} />
              </button>
            </div>
            {children}
          </>
        )}
      </main>
    </div>
  )
}
