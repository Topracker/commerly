'use client'
import { useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '../supabase'
import { LayoutDashboard, Package, LogOut, Menu, X, MessageCircle } from 'lucide-react'

const MENU = [
  { label: 'Dashboard', path: '/fornecedor/dashboard', icon: LayoutDashboard },
  { label: 'Produtos', path: '/fornecedor/produtos', icon: Package },
  { label: 'Mensagens', path: '/fornecedor/mensagens', icon: MessageCircle },
]

type Props = {
  fornecedor: any
  sair: () => Promise<void>
  titulo: string
  children: React.ReactNode
}

export function FornecedorLayout({ fornecedor, sair, titulo, children }: Props) {
  const [menuAberto, setMenuAberto] = useState(false)
  const [naoLidas, setNaoLidas] = useState(0)
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()

  useEffect(() => {
    if (!fornecedor?.id) return
    supabase
      .from('mensagens')
      .select('id', { count: 'exact', head: true })
      .eq('fornecedor_id', fornecedor.id)
      .eq('remetente', 'loja')
      .eq('lida', false)
      .then(({ count }) => setNaoLidas(count || 0))
  }, [fornecedor?.id, pathname])

  function navegar(path: string) {
    setMenuAberto(false)
    router.push(path)
  }

  const SidebarConteudo = () => (
    <div className="flex flex-col h-full p-4 gap-0.5">
      <div className="mb-4 px-2">
        <p className="text-xs text-purple-400 font-semibold uppercase tracking-wide mb-1">Fornecedor</p>
        <p className="text-white font-bold text-lg truncate">{fornecedor.nome}</p>
        <p className="text-gray-400 text-xs">{fornecedor.categoria}</p>
      </div>
      {MENU.map(item => {
        const ativo = pathname === item.path || (item.path === '/fornecedor/mensagens' && pathname.startsWith('/fornecedor/mensagens'))
        return (
          <button
            key={item.path}
            onClick={() => navegar(item.path)}
            className={`text-left px-3 py-2.5 rounded-xl transition flex items-center gap-3 ${ativo ? 'bg-purple-600' : 'hover:bg-gray-800'}`}
          >
            <item.icon size={16} className={ativo ? 'text-white shrink-0' : 'text-gray-400 shrink-0'} />
            <p className="text-white text-sm font-medium flex-1">{item.label}</p>
            {item.label === 'Mensagens' && naoLidas > 0 && (
              <span className="bg-purple-500 text-white text-xs rounded-full px-1.5 py-0.5 min-w-[20px] text-center font-bold shrink-0">
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
    <div className="min-h-screen bg-gray-950 flex">
      <aside className="hidden md:flex w-56 bg-gray-900 flex-col fixed h-full">
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

      <main className="md:ml-56 flex-1 p-4 md:p-6">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-6 md:hidden">
            <button onClick={() => setMenuAberto(true)} className="text-white">
              <Menu size={24} />
            </button>
            <h1 className="text-xl font-bold text-white">{titulo}</h1>
            <div className="w-6" />
          </div>
          <div className="hidden md:block mb-6">
            <h1 className="text-3xl font-bold text-white">{titulo}</h1>
          </div>
          {children}
        </div>
      </main>
    </div>
  )
}
