'use client'
import { useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '../supabase'
import { useNicho } from '../hooks/useNicho'
import { isDelivery } from '../lib/pedidosClientes'
import {
  TrendingDown, Clock, Users,
  MessageSquare, MessageCircle, Settings, LogOut, Menu, X, Wallet, Home, Sparkles, Plug, Crown, ShoppingBag
} from 'lucide-react'

// Itens sempre visíveis no topo.
const MENU_TOPO = [
  { label: 'Dashboard', path: '/dashboard', icon: Home },
  { label: 'Assistente IA', sub: 'Perguntas sobre a loja', path: '/assistente', icon: Sparkles },
]

// Itens administrativos/financeiros, sempre visíveis abaixo dos módulos do nicho.
const MENU_ADMIN = [
  { label: 'Fiado', sub: 'Controlar fiados', path: '/fiado', icon: Wallet },
  { label: 'Gastos', sub: 'Controlar despesas', path: '/gastos', icon: TrendingDown },
  { label: 'Histórico', sub: 'Ver todas as vendas', path: '/historico', icon: Clock },
  { label: 'Funcionários', sub: 'Gerenciar equipe', path: '/funcionarios', icon: Users },
  { label: 'Mensagens', sub: 'Chat com clientes e fornecedores', path: '/mensagens', icon: MessageCircle },
  { label: 'Feedback', sub: 'Enviar sugestão', path: '/feedback', icon: MessageSquare },
  { label: 'Integrações', sub: 'MP e PagBank', path: '/integracoes', icon: Plug },
  { label: 'Configurações', sub: 'Editar dados da loja', path: '/configuracoes', icon: Settings },
  { label: 'Meu Plano', sub: 'Assinatura', path: '/planos', icon: Crown },
]

type Props = {
  loja: any
  sair: () => Promise<void>
  titulo: string
  children: React.ReactNode
  maxWidth?: string
  noPadding?: boolean
}

export function AppLayout({ loja, sair, titulo, children, maxWidth = 'max-w-4xl', noPadding = false }: Props) {
  const [menuAberto, setMenuAberto] = useState(false)
  const [naoLidas, setNaoLidas] = useState(0)
  const [pedidosNovos, setPedidosNovos] = useState(0)
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()
  const { modulos } = useNicho(loja)

  const delivery = isDelivery(loja?.tipo)

  // Para delivery, o novo "Pedidos online" (/pedidos) substitui o módulo antigo
  // "Pedidos - Comandas e pedidos" (→ /vendas), que duplicava o conceito. Demais
  // nichos (ex.: Sorveteria) mantêm o módulo "Pedidos" original.
  const modulosMenu = delivery ? modulos.filter(m => m.key !== 'pedidos') : modulos

  // Menu = topo fixo + (Pedidos online, se delivery) + módulos + administrativo.
  const MENU = [
    ...MENU_TOPO,
    ...(delivery ? [{ label: 'Pedidos online', sub: 'Entregas dos clientes', path: '/pedidos', icon: ShoppingBag }] : []),
    ...modulosMenu.map(m => ({ label: m.label, sub: m.sub, path: m.path, icon: m.icon })),
    ...MENU_ADMIN,
  ]

  useEffect(() => {
    if (!loja?.id) return
    let ativo = true
    // Não-lidas no menu Mensagens = clientes + fornecedores.
    Promise.all([
      supabase
        .from('mensagens_clientes')
        .select('id', { count: 'exact', head: true })
        .eq('loja_id', loja.id)
        .eq('remetente', 'cliente')
        .eq('lida', false),
      supabase
        .from('mensagens')
        .select('id', { count: 'exact', head: true })
        .eq('loja_id', loja.id)
        .eq('remetente', 'fornecedor')
        .eq('lida', false),
    ]).then(([clientes, fornecedores]) => {
      if (ativo) setNaoLidas((clientes.count || 0) + (fornecedores.count || 0))
    })

    // Badge de pedidos online: pedidos em andamento (não entregues/cancelados).
    if (delivery) {
      supabase
        .from('pedidos_clientes')
        .select('id', { count: 'exact', head: true })
        .eq('loja_id', loja.id)
        .not('status', 'in', '(entregue,cancelado)')
        .then(({ count }) => { if (ativo) setPedidosNovos(count || 0) })
    }
    return () => { ativo = false }
  }, [loja?.id, pathname, delivery])

  function navegar(path: string) {
    setMenuAberto(false)
    router.push(path)
  }

  const SidebarConteudo = () => (
    <div className="flex flex-col h-full p-4">
      <div className="mb-4 px-2 shrink-0">
        <p className="text-white font-bold text-lg truncate">{loja.nome}</p>
        <p className="text-gray-400 text-xs">{loja.tipo}</p>
      </div>
      <div className="flex-1 overflow-y-auto min-h-0 flex flex-col gap-0.5">
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
              {item.label === 'Pedidos online' && pedidosNovos > 0 && (
                <span className="bg-green-500 text-white text-xs rounded-full px-1.5 py-0.5 min-w-[20px] text-center font-bold shrink-0">
                  {pedidosNovos}
                </span>
              )}
            </button>
          )
        })}
      </div>
      <div className="pt-2 shrink-0">
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

      <main className={`md:ml-56 flex-1 ${noPadding ? '' : 'p-4 md:p-6'}`}>
        <div className={noPadding ? 'w-full' : `${maxWidth} mx-auto`}>
          <div className={`flex items-center justify-between mb-6 md:hidden ${noPadding ? 'px-4 pt-4' : ''}`}>
            <button onClick={() => setMenuAberto(true)} className="text-white">
              <Menu size={24} />
            </button>
            <h1 className="text-xl font-bold text-white">{titulo}</h1>
            <div className="w-6" />
          </div>
          <div className={`hidden md:block mb-6 ${noPadding ? 'px-6 pt-6' : ''}`}>
            <h1 className="text-3xl font-bold text-white">{titulo}</h1>
          </div>
          {children}
        </div>
      </main>
    </div>
  )
}
