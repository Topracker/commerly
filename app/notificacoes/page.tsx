'use client'
import { useAuth } from '../hooks/useAuth'
import { AppLayout } from '../components/AppLayout'
import { NotificacoesLista } from '../components/NotificacoesLista'

// Histórico de notificações do comerciante.
export default function NotificacoesComerciante() {
  const { loja, loading, sair } = useAuth()

  if (loading) return (
    <main className="min-h-screen bg-gray-950 flex items-center justify-center">
      <p className="text-gray-400">Carregando...</p>
    </main>
  )
  if (!loja) return null

  return (
    <AppLayout loja={loja} sair={sair} titulo="Notificações">
      <NotificacoesLista cor="blue" />
    </AppLayout>
  )
}
