'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useCliente } from '../../hooks/useCliente'
import { ClienteLayout } from '../../components/ClienteLayout'
import { MessageCircle } from 'lucide-react'

export default function ClienteMensagens() {
  const { cliente, loading, supabase, sair } = useCliente()
  const [conversas, setConversas] = useState<any[]>([])
  const [carregando, setCarregando] = useState(false)
  const router = useRouter()

  useEffect(() => {
    if (cliente) carregarConversas()
  }, [cliente])

  async function carregarConversas() {
    setCarregando(true)
    const { data } = await supabase
      .from('mensagens_clientes')
      .select('loja_id, conteudo, created_at, remetente, lida, lojas(id, nome, tipo)')
      .eq('cliente_id', cliente!.id)
      .order('created_at', { ascending: false })

    if (data) {
      const map: Record<string, any> = {}
      data.forEach((m: any) => {
        if (!map[m.loja_id]) {
          map[m.loja_id] = {
            loja_id: m.loja_id,
            loja_nome: m.lojas?.nome || 'Loja',
            loja_tipo: m.lojas?.tipo || '',
            ultima_msg: m.conteudo,
            created_at: m.created_at,
            nao_lidas: 0,
          }
        }
        if (m.remetente === 'loja' && !m.lida) map[m.loja_id].nao_lidas++
      })
      setConversas(Object.values(map))
    }
    setCarregando(false)
  }

  if (loading) return (
    <main className="min-h-screen bg-gray-950 flex items-center justify-center">
      <p className="text-gray-400">Carregando...</p>
    </main>
  )
  if (!cliente) return null

  return (
    <ClienteLayout cliente={cliente} sair={sair}>
      <h1 className="text-2xl font-bold text-white mb-6 hidden md:block">Mensagens</h1>

      {carregando ? (
        <div className="text-center py-12 text-gray-500">Carregando...</div>
      ) : conversas.length === 0 ? (
        <div className="bg-gray-900 rounded-2xl p-10 text-center">
          <MessageCircle size={32} className="mx-auto mb-3 text-gray-600" />
          <p className="text-gray-500">Nenhuma conversa ainda.</p>
          <p className="text-gray-600 text-sm mt-1">Visite uma loja e inicie uma conversa!</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2 max-w-2xl mx-auto">
          {conversas.map(c => (
            <button
              key={c.loja_id}
              onClick={() => router.push(`/cliente/mensagens/${c.loja_id}`)}
              className="bg-gray-900 hover:bg-gray-800 rounded-2xl p-4 text-left transition flex items-center gap-3"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-white font-semibold truncate">{c.loja_nome}</p>
                  {c.nao_lidas > 0 && (
                    <span className="shrink-0 bg-green-500 text-white text-xs rounded-full px-1.5 py-0.5 font-bold">
                      {c.nao_lidas}
                    </span>
                  )}
                </div>
                {c.loja_tipo && <p className="text-xs text-gray-500 mt-0.5">{c.loja_tipo}</p>}
                <p className="text-sm text-gray-400 truncate mt-1">{c.ultima_msg}</p>
              </div>
              <span className="text-gray-600 text-xs shrink-0">
                {new Date(c.created_at).toLocaleDateString('pt-BR')}
              </span>
            </button>
          ))}
        </div>
      )}
    </ClienteLayout>
  )
}
