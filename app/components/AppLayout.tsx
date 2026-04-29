'use client'
import { useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '../supabase'
import {
  Package, ShoppingCart, TrendingDown, Clock, Users,
  MessageSquare, Settings, LogOut, Menu, X, Wallet, Home, Truck, MessageCircle
} from 'lucide-react'

const MENU = [
  { label: 'Dashboard', path: '/dashboard', icon: Home },
  { label: 'Produtos', sub: 'Gerenciar estoque', path: '/produtos', icon: Package },
  { label: 'Vendas', sub: 'Registrar vendas', path: '/vendas', icon: ShoppingCart },
  { label: 'Fiado', sub: 'Controlar fiados', path: '/fiado', icon: Wallet },
  { label: 'Gastos', sub: 'Controlar despesas', path: '/gastos', icon: TrendingDown },
  { label: 'Histórico', sub: 'Ver todas as vendas', path: '/historico', icon: Clock },
  { label: 'Funcionários', sub: 'Gerenciar equipe', path: '/funcionarios', icon: Users },
  { label: 'Fornecedores', sub: 'Buscar fornecedores', path: '/fornecedores', icon: Truck },
  { label: 'Mensagens', sub: 'Chat com fornecedores', path: '/mensagens', icon: MessageCircle },
  { label: 'Feedback', sub: 'Enviar sugestão', path: '/feedback', icon: MessageSquare },
  { label: 'Configurações', sub: 'Editar dados da loja', path: '/configuracoes', icon: Settings },
]

type Props = {
  loja: any
  sair: () => Promise<void>
  titulo: string
  children: React.ReactNode
  maxWidth?: string
}

export function AppLayout({ loja, sair, titulo, children, maxWidth = 'max-w-4xl' }: Props) {
  const [menuAberto, setMenuAberto] = useState(false)
  const [naoLidas, setNaoLidas] = useState(0)
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()

  useEffect(() => {
    if (!loja?.id) return
    supabase
      .from('mensagens')
      .select('id', { count: 'exact', head: true })
      .eq('loja_id', loja.id)
      .eq('remetente', 'fornecedor')
      .eq('lida', false)
      .then(({ count }) => setNaoLidas(count || 0))
  }, [loja?.id, pathname])

  function navegar(path: string) {
    setMenuAberto(false)
    router.push(path)
  }

  const SidebarConteudo = () => (
    <div className="flex flex-col h-full p-4 gap-0.5">
      <div className="mb-4 px-2">
        <p className="text-white font-bold text-lg truncate">{loja.nome}</p>
        <p className="text-gray-400 text-xs">{loja.tipo}</p>
      </div>
      {MENU.map(item => {
        const ativo = pathname === item.path || (item.path === '/mensagens' && pathname.startsWith('/mensagens'))
        return (
          <button
            key={item.path}
            onClick={() => navegar(item.path)}
            className={`text-left px-3 py-2.5 rounded-xl transition flex items-center gap-3 ${ativo ? 'bg-blue-600' : 'hover:bg-gray-800'}`}
          >
            <item.icon size={16} className={ativo ? 'text-white shrink-0' : 'text-gray-400 shrink-0'} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white">{item.label}</p>
              {'sub' in item && <p className="text-gray-400 text-xs">{(item as any).sub}</p>}
            </div>
            {item.label === 'Mensagens' && naoLidas > 0 && (
              <span className="bg-blue-500 text-white text-xs rounded-full px-1.5 py-0.5 min-w-[20px] text-center font-bold shrink-0">
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
        <div className={`${maxWidth} mx-auto`}>
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
