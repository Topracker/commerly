'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '../hooks/useAuth'
import { AppLayout } from '../components/AppLayout'
import { MessageCircle } from 'lucide-react'

export default function MensagensComercianteList() {
  const { loja, loading, supabase, sair } = useAuth()
  const [conversas, setConversas] = useState<any[]>([])
  const [carregando, setCarregando] = useState(true)
  const router = useRouter()

  useEffect(() => {
    if (loja) carregar()
  }, [loja])

  async function carregar() {
    const { data: msgs } = await supabase
      .from('mensagens')
      .select('fornecedor_id, conteudo, remetente, created_at, lida')
      .eq('loja_id', loja.id)
      .order('created_at', { ascending: false })

    if (!msgs || msgs.length === 0) { setCarregando(false); return }

    const mapaConversas: Record<string, any> = {}
    for (const m of msgs) {
      if (!mapaConversas[m.fornecedor_id]) {
        mapaConversas[m.fornecedor_id] = {
          fornecedor_id: m.fornecedor_id,
          ultima_mensagem: m.conteudo,
          ultima_hora: m.created_at,
          nao_lidas: 0,
        }
      }
      if (m.remetente === 'fornecedor' && !m.lida) mapaConversas[m.fornecedor_id].nao_lidas++
    }

    const fornecedorIds = Object.keys(mapaConversas)
    const { data: fornecedores } = await supabase
      .from('fornecedores')
      .select('id, nome, categoria')
      .in('id', fornecedorIds)

    const lista = fornecedorIds
      .map(id => ({
        ...mapaConversas[id],
        fornecedor: fornecedores?.find(f => f.id === id) || { nome: 'Fornecedor', categoria: '' },
      }))
      .sort((a, b) => new Date(b.ultima_hora).getTime() - new Date(a.ultima_hora).getTime())

    setConversas(lista)
    setCarregando(false)
  }

  if (loading) return (
    <main className="min-h-screen bg-gray-950 flex items-center justify-center">
      <p className="text-gray-400">Carregando...</p>
    </main>
  )
  if (!loja) return null

  return (
    <AppLayout loja={loja} sair={sair} titulo="Mensagens">
      {carregando ? (
        <div className="text-center py-12 text-gray-500">Carregando...</div>
      ) : conversas.length === 0 ? (
        <div className="text-center py-20 text-gray-500 flex flex-col items-center gap-3">
          <MessageCircle size={40} className="opacity-30" />
          <p>Nenhuma conversa ainda.</p>
          <p className="text-sm">Encontre fornecedores e envie uma mensagem.</p>
          <button
            onClick={() => router.push('/fornecedores')}
            className="mt-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition"
          >
            Buscar fornecedores
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {conversas.map(c => (
            <button
              key={c.fornecedor_id}
              onClick={() => router.push(`/mensagens/${c.fornecedor_id}`)}
              className="bg-gray-900 rounded-2xl p-4 text-left hover:bg-gray-800 transition flex items-center gap-3"
            >
              <div className="w-10 h-10 bg-purple-900 rounded-full flex items-center justify-center shrink-0">
                <MessageCircle size={18} className="text-purple-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-white font-semibold truncate">{c.fornecedor.nome}</p>
                  <p className="text-gray-500 text-xs shrink-0">
                    {new Date(c.ultima_hora).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                  </p>
                </div>
                <div className="flex items-center justify-between gap-2 mt-0.5">
                  <div className="min-w-0">
                    <p className="text-gray-500 text-xs">{c.fornecedor.categoria}</p>
                    <p className="text-gray-400 text-sm truncate">{c.ultima_mensagem}</p>
                  </div>
                  {c.nao_lidas > 0 && (
                    <span className="bg-blue-600 text-white text-xs rounded-full px-1.5 py-0.5 shrink-0 min-w-[20px] text-center font-bold">
                      {c.nao_lidas}
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </AppLayout>
  )
}
