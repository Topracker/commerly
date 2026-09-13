'use client'
import { LogOut } from 'lucide-react'

// Botão de sair (logout) compartilhado pelos 4 painéis, pelos 4 onboardings e
// pela tela "sem-loja" do /login. Antes cada lugar tinha a própria versão —
// texto cinza sem fundo nos menus, só o ícone no header do entregador e um
// link sublinhado no onboarding — e a ação passava despercebida (2026-09-13).
//
// Não sabe deslogar: recebe o `onClick` de quem já tem o `sair()`/`signOut`.
// Usa os tokens do tema (borda/superficie) para valer no claro e no escuro; o
// vermelho só no hover é a mesma convenção do "cancelar pedido".
type Variante =
  | 'menu'      // item de largura total no sidebar (comerciante/cliente/fornecedor)
  | 'compacto'  // pill no header do entregador
  | 'destaque'  // botão cheio em telas sem outra saída (onboardings, sem-loja)

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-xl border border-borda bg-superficie ' +
  'text-gray-200 font-semibold transition hover:bg-red-500/10 hover:border-red-500/40 hover:text-red-400 ' +
  'disabled:opacity-50 disabled:cursor-not-allowed'

const POR_VARIANTE: Record<Variante, string> = {
  menu: 'w-full justify-start px-3 py-2.5 text-sm',
  compacto: 'shrink-0 px-3 py-1.5 text-sm',
  destaque: 'w-full py-3 text-sm',
}

export default function BotaoSair({
  onClick,
  variante = 'menu',
  label = 'Sair',
  disabled = false,
  className = '',
}: {
  onClick: () => void
  variante?: Variante
  label?: string
  disabled?: boolean
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={`${BASE} ${POR_VARIANTE[variante]} ${className}`}
    >
      <LogOut size={16} className="shrink-0" />
      <span>{label}</span>
    </button>
  )
}
