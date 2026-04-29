import { useState } from 'react'

export type ToastTipo = 'sucesso' | 'erro'
export type ToastState = { mensagem: string; tipo: ToastTipo } | null

export function useToast() {
  const [toast, setToast] = useState<ToastState>(null)

  function mostrarToast(mensagem: string, tipo: ToastTipo = 'sucesso') {
    setToast({ mensagem, tipo })
    setTimeout(() => setToast(null), 3000)
  }

  return { toast, mostrarToast }
}
