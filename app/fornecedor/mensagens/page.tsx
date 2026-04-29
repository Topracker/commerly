'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useFornecedor } from '../../hooks/useFornecedor'
import { FornecedorLayout } from '../../components/FornecedorLayout'
import { MessageCircle } from 'lucide-react'

export default function FornecedorMensagens() {
  const { fornecedor, loading, supabase, sair } = useFornecedor()
  const [conversas, setConversas] = useState<any[]>([])
  const [carregando, setCarregando] = useState(true)
  const router = useRouter()

  useEffect(() => {
    if (fornecedor) carregar()
  }, [fornecedor])

  async function carregar() {
    const { data: msgs } = await supabase
      .from('mensagens')
      .select('loja_id, conteudo, remetente, created_at, lida')
      .eq('fornecedor_id', fornecedor.id)
      .order('created_at', { ascending: false })

    if (!msgs || msgs.length === 0) { setCarregando(false); return }

    const mapaConversas: Record<string, any> = {}
    for (const m of msgs) {
      if (!mapaConversas[m.loja_id]) {
        mapaConversas[m.loja_id] = { loja_id: m.loja_id, ultima_mensagem: m.conteudo, ultima_hora: m.created_at, nao_lidas: 0 }
      }
      if (m.remetente === 'loja' && !m.lida) mapaConversas[m.loja_id].nao_lidas++
    }

    const lojaIds = Object.keys(mapaConversas)
    const { data: lojas } = await supabase.from('lojas').select('id, nome, tipo').in('id', lojaIds)

    const lista = lojaIds
      .map(id => ({ ...mapaConversas[id], loja: lojas?.find(l => l.id === id) || { nome: 'Loja', tipo: '' } }))
      .sort((a, b) => new Date(b.ultima_hora).getTime() - new Date(a.ultima_hora).getTime())

    setConversas(lista)
    setCarregando(false)
  }

  if (loading) return (
    <main className="min-h-screen bg-gray-950 flex items-center justify-center">
      <p className="text-gray-400">Carregando...</p>
    </main>
  )
  if (!fornecedor) return null

  return (
    <FornecedorLayout fornecedor={fornecedor} sair={sair} titulo="Mensagens">
      {carregando ? (
        <div className="text-center py-12 text-gray-500">Carregando...</div>
      ) : conversas.length === 0 ? (
        <div className="text-center py-20 text-gray-500 flex flex-col items-center gap-3">
          <MessageCircle size={40} className="opacity-30" />
          <p>Nenhuma mensagem recebida ainda.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {conversas.map(c => (
            <button
              key={c.loja_id}
              onClick={() => router.push(`/fornecedor/mensagens/${c.loja_id}`)}
              className="bg-gray-900 rounded-2xl p-4 text-left hover:bg-gray-800 transition flex items-center gap-3"
            >
              <div className="w-10 h-10 bg-blue-900 rounded-full flex items-center justify-center shrink-0">
                <MessageCircle size={18} className="text-blue-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-white font-semibold truncate">{c.loja.nome}</p>
                  <p className="text-gray-500 text-xs shrink-0">
                    {new Date(c.ultima_hora).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                  </p>
                </div>
                <div className="flex items-center justify-between gap-2 mt-0.5">
                  <p className="text-gray-400 text-sm truncate">{c.ultima_mensagem}</p>
                  {c.nao_lidas > 0 && (
                    <span className="bg-purple-600 text-white text-xs rounded-full px-1.5 py-0.5 shrink-0 min-w-[20px] text-center font-medium">
                      {c.nao_lidas}
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </FornecedorLayout>
  )
}
