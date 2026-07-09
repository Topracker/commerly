'use client'
import { useEntregador } from '../../hooks/useEntregador'
import { EntregadorLayout } from '../../components/EntregadorLayout'
import { NotificacoesLista } from '../../components/NotificacoesLista'

// Histórico de notificações do entregador.
export default function NotificacoesEntregador() {
  const { entregador, loading, sair } = useEntregador()

  if (loading) return (
    <main className="min-h-screen bg-fundo flex items-center justify-center">
      <p className="text-gray-400">Carregando...</p>
    </main>
  )
  if (!entregador) return null

  return (
    <EntregadorLayout entregador={entregador} sair={sair} titulo="Notificações">
      <NotificacoesLista cor="orange" />
    </EntregadorLayout>
  )
}
