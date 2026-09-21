'use client'
import type { ReactNode } from 'react'

// Chip de filtro (liga/desliga) — mesmo desenho dos chips da Central de Ajuda
// (app/suporte/CentralAjuda.tsx), reaproveitado no Modo Festa.
export function ChipFiltro({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={ativo}
      onClick={onClick}
      className={`inline-flex shrink-0 items-center gap-1.5 text-xs font-medium rounded-full px-3 py-1.5 border transition whitespace-nowrap ${
        ativo
          ? 'bg-acento border-acento text-white'
          : 'bg-superficie border-borda text-gray-400 hover:text-gray-200 hover:border-[#2b3440]'
      }`}
    >
      {children}
    </button>
  )
}
