'use client'
import { useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '../supabase'
import { useNicho } from '../hooks/useNicho'
import { useNotificacoes } from '../hooks/useNotificacoes'
import { useTema } from '../hooks/useTema'
import { NotificacaoToast } from './NotificacaoToast'
import { isDelivery } from '../lib/pedidosClientes'
import { carregarAgendamentosProximos } from '../lib/nicheStore'
import { montarMenu, secaoDaRota, type BadgeKey } from '../lib/menu'
import { LogOut, Menu, X, ChevronDown, Sun, Moon } from 'lucide-react'

type Props = {
  loja: any
  sair: () => Promise<void>
  titulo: string
  children: React.ReactNode
  maxWidth?: string
  noPadding?: boolean
}

/** Chave do localStorage com as seções que o comerciante fechou. */
const SECOES_KEY = 'commerly:menu:fechadas'

export function AppLayout({ loja, sair, titulo, children, maxWidth = 'max-w-4xl', noPadding = false }: Props) {
  const [menuAberto, setMenuAberto] = useState(false)
  const [naoLidas, setNaoLidas] = useState(0)
  const [pedidosNovos, setPedidosNovos] = useState(0)
  const [agProximos, setAgProximos] = useState(0)
  const [fechadas, setFechadas] = useState<Set<string>>(new Set())
  const { naoLidas: notifNaoLidas, toastNotif, fecharToast } = useNotificacoes()
  const { tema, alternar } = useTema()
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()
  const { modulos } = useNicho(loja)

  const delivery = isDelivery(loja?.tipo)
  const temAgenda = modulos.some(m => m.key === 'agenda')

  const secoes = montarMenu({ delivery, modulos })
  const secaoAtiva = secaoDaRota(secoes, pathname)

  const contadores: Record<BadgeKey, number> = {
    notificacoes: notifNaoLidas,
    mensagens: naoLidas,
    pedidos: pedidosNovos,
    agenda: agProximos,
  }
  const COR_BADGE: Record<BadgeKey, string> = {
    notificacoes: 'bg-red-500',
    mensagens: 'bg-blue-500',
    pedidos: 'bg-green-500',
    agenda: 'bg-amber-500',
  }

  // Quais seções o comerciante fechou. A seção da rota atual sempre abre — se
  // ele está em /combos, esconder "Produtos e Vendas" só o deixaria perdido.
  useEffect(() => {
    try {
      const salvo = JSON.parse(localStorage.getItem(SECOES_KEY) || '[]')
      if (Array.isArray(salvo)) setFechadas(new Set(salvo))
    } catch { /* localStorage indisponível: tudo aberto */ }
  }, [])

  function alternarSecao(chave: string) {
    setFechadas(prev => {
      const proximo = new Set(prev)
      if (proximo.has(chave)) proximo.delete(chave)
      else proximo.add(chave)
      try { localStorage.setItem(SECOES_KEY, JSON.stringify([...proximo])) } catch { /* ignora */ }
      return proximo
    })
  }

  const secaoAberta = (chave: string) => chave === secaoAtiva || !fechadas.has(chave)

  useEffect(() => {
    if (!loja?.id) return
    let ativo = true
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

    if (delivery) {
      supabase
        .from('pedidos_clientes')
        .select('id', { count: 'exact', head: true })
        .eq('loja_id', loja.id)
        .not('status', 'in', '(entregue,cancelado)')
        .then(({ count }) => { if (ativo) setPedidosNovos(count || 0) })
    }

    if (temAgenda) {
      carregarAgendamentosProximos(loja.id)
        .then(l => { if (ativo) setAgProximos(l.length) })
        .catch(() => { if (ativo) setAgProximos(0) })
    } else {
      setAgProximos(0)
    }
    return () => { ativo = false }
  }, [loja?.id, pathname, delivery, temAgenda])

  function navegar(path: string) {
    setMenuAberto(false)
    router.push(path)
  }

  // Elementos, não componentes: um `const X = () => ...` renderizado como <X />
  // vira um tipo novo a cada render, o React remonta a subárvore e a animação
  // das seções nunca chega a rodar.
  const botaoTema = (
    <button
      onClick={alternar}
      title={tema === 'claro' ? 'Mudar para o tema escuro' : 'Mudar para o tema claro'}
      aria-label={tema === 'claro' ? 'Mudar para o tema escuro' : 'Mudar para o tema claro'}
      className="shrink-0 w-9 h-9 rounded-xl border border-gray-800 bg-gray-900 text-gray-400 hover:text-white hover:border-gray-700 transition flex items-center justify-center"
    >
      {tema === 'claro' ? <Moon size={16} /> : <Sun size={16} />}
    </button>
  )

  const sidebar = (
    <div className="flex flex-col h-full p-4">
      <div className="mb-4 px-2 shrink-0">
        <p className="text-white font-bold text-lg truncate">{loja.nome}</p>
        <p className="text-gray-400 text-xs">{loja.tipo}</p>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 flex flex-col gap-1">
        {secoes.map(secao => {
          const aberta = secaoAberta(secao.chave)
          return (
            <div key={secao.chave}>
              <button
                onClick={() => alternarSecao(secao.chave)}
                aria-expanded={aberta}
                className="w-full flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-gray-500 hover:text-gray-300 transition group"
              >
                <span className="text-[11px] font-semibold uppercase tracking-wide flex-1 text-left">
                  {secao.titulo}
                </span>
                <ChevronDown
                  size={13}
                  className={`transition-transform duration-200 ${aberta ? '' : '-rotate-90'}`}
                />
              </button>

              <div className="secao-menu" data-aberta={aberta}>
                <div>
                  <div className="flex flex-col gap-0.5 pb-1">
                    {secao.itens.map(item => {
                      const rota = item.path.split('#')[0]
                      const ancora = item.path.includes('#')
                      // Um item com âncora não "acende" pela rota: /clientes e
                      // /clientes#campanha-retorno acenderiam os dois juntos.
                      const ativo = !ancora
                        && (pathname === rota || (rota === '/mensagens' && pathname.startsWith('/mensagens')))
                      const contador = item.badge ? contadores[item.badge] : 0
                      return (
                        <button
                          key={item.path}
                          onClick={() => navegar(item.path)}
                          className={`text-left px-3 py-2.5 rounded-xl transition flex items-center gap-3 ${ativo ? 'bg-blue-600' : 'hover:bg-gray-800'}`}
                        >
                          <item.icon size={16} className={ativo ? 'text-white shrink-0' : 'text-gray-400 shrink-0'} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-white">{item.label}</p>
                            {item.sub && <p className="text-gray-400 text-xs">{item.sub}</p>}
                          </div>
                          {item.badge && contador > 0 && (
                            <span className={`${COR_BADGE[item.badge]} text-white text-xs rounded-full px-1.5 py-0.5 min-w-[20px] text-center font-bold shrink-0`}>
                              {contador}
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>
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
      <NotificacaoToast notif={toastNotif} onFechar={fecharToast} />
      <aside className="hidden md:flex w-56 bg-gray-900 flex-col fixed h-full">
        {sidebar}
      </aside>

      {menuAberto && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="w-64 bg-gray-900 h-full overflow-y-auto">
            <div className="flex justify-end p-3">
              <button onClick={() => setMenuAberto(false)} className="text-gray-400 hover:text-white">
                <X size={24} />
              </button>
            </div>
            {sidebar}
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
            {botaoTema}
          </div>
          <div className={`hidden md:flex items-center justify-between gap-4 mb-6 ${noPadding ? 'px-6 pt-6' : ''}`}>
            <h1 className="text-3xl font-bold text-white">{titulo}</h1>
            {botaoTema}
          </div>
          {children}
        </div>
      </main>
    </div>
  )
}
