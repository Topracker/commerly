'use client'
import { useCliente } from '../../hooks/useCliente'
import { ClienteLayout } from '../../components/ClienteLayout'
import { NotificacoesLista } from '../../components/NotificacoesLista'

// Histórico de notificações do cliente.
export default function NotificacoesCliente() {
  const { cliente, loading, sair } = useCliente()

  if (loading) return (
    <main className="min-h-screen bg-gray-950 flex items-center justify-center">
      <p className="text-gray-400">Carregando...</p>
    </main>
  )
  if (!cliente) return null

  return (
    <ClienteLayout cliente={cliente} sair={sair}>
      <h1 className="text-2xl font-bold text-white mb-4 hidden md:block">Notificações</h1>
      <NotificacoesLista cor="green" />
    </ClienteLayout>
  )
}
