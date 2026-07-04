'use client'
import { useRouter } from 'next/navigation'
import { LogOut, Bike, Bell } from 'lucide-react'
import type { Entregador } from '../lib/entregadores'
import { useNotificacoes } from '../hooks/useNotificacoes'
import { NotificacaoToast } from './NotificacaoToast'

type Props = {
  entregador: Entregador
  sair: () => Promise<void>
  titulo: string
  children: React.ReactNode
}

// Layout enxuto e mobile-first — o entregador usa no celular, na rua.
export function EntregadorLayout({ entregador, sair, titulo, children }: Props) {
  const router = useRouter()
  const { naoLidas, toastNotif, fecharToast } = useNotificacoes()

  return (
    <div className="min-h-screen bg-[#0a0f1a]">
      <NotificacaoToast notif={toastNotif} onFechar={fecharToast} />
      <header className="sticky top-0 z-20 bg-[#12161B] border-b border-[#232A32] px-4 py-3 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-[#C1441E]/15 flex items-center justify-center shrink-0 overflow-hidden">
          {entregador.foto_url
            ? <img src={entregador.foto_url} alt="" className="w-full h-full object-cover" />
            : <Bike size={18} className="text-[#E0632C]" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-wide text-[#E0632C] font-semibold">Entregador</p>
          <p className="text-white font-semibold text-sm truncate leading-tight">{titulo}</p>
        </div>
        <button
          onClick={() => router.push('/entregador-delivery/notificacoes')}
          className="relative shrink-0 text-gray-400 hover:text-white transition p-1"
          aria-label="Notificações"
        >
          <Bell size={19} />
          {naoLidas > 0 && (
            <span className="absolute -top-0.5 -right-0.5 bg-[#C1441E] text-white text-[10px] leading-none rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center font-bold">
              {naoLidas > 9 ? '9+' : naoLidas}
            </span>
          )}
        </button>
        <button
          onClick={sair}
          className="shrink-0 text-gray-400 hover:text-white flex items-center gap-1.5 text-sm"
          aria-label="Sair"
        >
          <LogOut size={16} />
        </button>
      </header>
      <main className="max-w-2xl mx-auto px-4 py-5 pb-24">{children}</main>
    </div>
  )
}

export default EntregadorLayout
