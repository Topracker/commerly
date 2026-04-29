'use client'
import type { ToastState } from '../hooks/useToast'

export function Toast({ toast }: { toast: ToastState }) {
  if (!toast) return null
  return (
    <div className={`fixed top-4 right-4 z-50 px-5 py-3 rounded-xl text-white font-semibold shadow-lg ${toast.tipo === 'sucesso' ? 'bg-green-600' : 'bg-red-600'}`}>
      {toast.mensagem}
    </div>
  )
}
