'use client'
import { useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '../supabase'
import { useNotificacoes } from '../hooks/useNotificacoes'
import { NotificacaoToast } from './NotificacaoToast'
import { TemaControle } from './TemaControle'
import { Search, Heart, MessageCircle, User, LogOut, Menu, X, Trophy, ShoppingBag, Bell, Sparkles, Rss, PartyPopper } from 'lucide-react'

const MENU = [
  { label: 'Feed', path: '/cliente/feed', icon: Rss },
  { label: 'Buscar lojas', path: '/cliente/buscar', icon: Search },
  { label: '🎉 Festa', path: '/cliente/festa', icon: PartyPopper },
  { label: 'Meus pedidos', path: '/cliente/pedidos', icon: ShoppingBag },
  { label: 'Clube Commerly', path: '/cliente/clube', icon: Sparkles },
  { label: 'Notificações', path: '/cliente/notificacoes', icon: Bell },
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
  /**
   * Só com `fullHeight`: a barra do celular flutua POR CIMA do conteúdo em vez
   * de empilhar acima dele. É o que deixa o feed em tela cheia ocupar a altura
   * inteira — com a barra no fluxo, sobrava sempre uma faixa e o snap parava
   * meio post na tela.
   */
  barraSobreposta?: boolean
}

export function ClienteLayout({
  cliente, sair, children, noPadding = false, fullHeight = false, barraSobreposta = false,
}: Props) {
  const [menuAberto, setMenuAberto] = useState(false)
  const [naoLidas, setNaoLidas] = useState(0)
  const { naoLidas: notifNaoLidas, toastNotif, fecharToast } = useNotificacoes()
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
      {/* Header da sidebar: o controle de aparência mora aqui, sempre visível.
          No rodapé ele ficava fora da viewport em telas baixas — e o painel
          abria para baixo, além da borda inferior, parecendo não funcionar. */}
      <div className="mb-4 px-2 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-acento font-semibold uppercase tracking-wide mb-1">Cliente</p>
          <p className="text-white font-bold text-lg truncate">{cliente.nome}</p>
        </div>
        <TemaControle alinhamento="esquerda" />
      </div>
      {MENU.map(item => {
        const ativo = pathname === item.path ||
          (item.path === '/cliente/mensagens' && pathname.startsWith('/cliente/mensagens')) ||
          (item.path === '/cliente/festa' && pathname.startsWith('/cliente/festa'))
        return (
          <button
            key={item.path}
            onClick={() => navegar(item.path)}
            className={`text-left px-3 py-2.5 rounded-xl transition flex items-center gap-3 ${ativo ? 'bg-acento' : 'hover:bg-gray-800'}`}
          >
            <item.icon size={16} className={ativo ? 'text-white shrink-0' : 'text-gray-400 shrink-0'} />
            <p className="text-white text-sm font-medium flex-1">{item.label}</p>
            {item.label === 'Mensagens' && naoLidas > 0 && (
              <span className="bg-acento text-white text-xs rounded-full px-1.5 py-0.5 min-w-[20px] text-center font-bold shrink-0">
                {naoLidas}
              </span>
            )}
            {item.label === 'Notificações' && notifNaoLidas > 0 && (
              <span className="bg-acento text-white text-xs rounded-full px-1.5 py-0.5 min-w-[20px] text-center font-bold shrink-0">
                {notifNaoLidas}
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
    // `h-[100dvh]` e não `h-screen`: no celular o 100vh do CSS ignora a barra
    // do navegador, e a última faixa da tela ficava embaixo dela.
    <div className={`${fullHeight ? 'h-[100dvh] overflow-hidden' : 'min-h-screen'} bg-gray-950 flex`}>
      <NotificacaoToast notif={toastNotif} onFechar={fecharToast} />
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

      {/* `min-w-0`: sem isto o main (flex-1, min-width:auto) estica junto com
          qualquer filho largo e a página inteira ganha rolagem horizontal — o
          que empurrava o controle de aparência (ml-auto) para fora da tela no
          celular. */}
      <main className={`md:ml-56 flex-1 min-w-0 ${fullHeight ? `flex flex-col overflow-hidden${barraSobreposta ? ' relative' : ''}` : noPadding ? '' : 'p-4 md:p-6'}`}>
        {fullHeight ? (
          <>
            <div
              // `midia-cheia` na barra sobreposta: ela flutua sobre o vídeo, e
              // sem isso o ícone do menu vira tinta escura no tema claro —
              // preto sobre preto.
              className={`md:hidden flex items-center gap-3 px-4 py-2 ${
                barraSobreposta
                  ? 'midia-cheia absolute top-0 inset-x-0 z-30 bg-gradient-to-b from-black/60 to-transparent'
                  : 'shrink-0 bg-gray-900 border-b border-gray-800'
              }`}
            >
              <button onClick={() => setMenuAberto(true)} className="text-white drop-shadow">
                <Menu size={22} />
              </button>
              <div className="ml-auto"><TemaControle /></div>
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
              <div className="ml-auto"><TemaControle /></div>
            </div>
            {children}
          </>
        )}
      </main>
    </div>
  )
}
