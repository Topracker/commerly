'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '../hooks/useAuth'
import { AppLayout } from '../components/AppLayout'
import { MessageCircle, Users } from 'lucide-react'

type Aba = 'clientes' | 'fornecedores'

export default function MensagensComercianteList() {
  const { loja, loading, supabase, sair } = useAuth()
  const [aba, setAba] = useState<Aba>('clientes')
  const [conversasClientes, setConversasClientes] = useState<any[]>([])
  const [conversasFornecedores, setConversasFornecedores] = useState<any[]>([])
  const [carregando, setCarregando] = useState(true)
  const router = useRouter()

  useEffect(() => {
    if (loja) carregar()
  }, [loja])

  async function carregar() {
    await Promise.all([carregarClientes(), carregarFornecedores()])
    setCarregando(false)
  }

  async function carregarClientes() {
    const { data: msgs } = await supabase
      .from('mensagens_clientes')
      .select('cliente_id, conteudo, remetente, created_at, lida')
      .eq('loja_id', loja!.id)
      .order('created_at', { ascending: false })

    if (!msgs || msgs.length === 0) return

    const mapa: Record<string, any> = {}
    for (const m of msgs) {
      if (!mapa[m.cliente_id]) {
        mapa[m.cliente_id] = {
          cliente_id: m.cliente_id,
          ultima_mensagem: m.conteudo,
          ultima_hora: m.created_at,
          nao_lidas: 0,
        }
      }
      if (m.remetente === 'cliente' && !m.lida) mapa[m.cliente_id].nao_lidas++
    }

    const ids = Object.keys(mapa)
    const { data: clientes } = await supabase
      .from('clientes')
      .select('id, nome')
      .in('id', ids)

    const lista = ids
      .map(id => ({
        ...mapa[id],
        cliente: clientes?.find(c => c.id === id) || { nome: 'Cliente' },
      }))
      .sort((a, b) => new Date(b.ultima_hora).getTime() - new Date(a.ultima_hora).getTime())

    setConversasClientes(lista)
  }

  async function carregarFornecedores() {
    const { data: msgs } = await supabase
      .from('mensagens')
      .select('fornecedor_id, conteudo, remetente, created_at, lida')
      .eq('loja_id', loja!.id)
      .order('created_at', { ascending: false })

    if (!msgs || msgs.length === 0) return

    const mapa: Record<string, any> = {}
    for (const m of msgs) {
      if (!mapa[m.fornecedor_id]) {
        mapa[m.fornecedor_id] = {
          fornecedor_id: m.fornecedor_id,
          ultima_mensagem: m.conteudo,
          ultima_hora: m.created_at,
          nao_lidas: 0,
        }
      }
      if (m.remetente === 'fornecedor' && !m.lida) mapa[m.fornecedor_id].nao_lidas++
    }

    const ids = Object.keys(mapa)
    const { data: fornecedores } = await supabase
      .from('fornecedores')
      .select('id, nome, categoria')
      .in('id', ids)

    const lista = ids
      .map(id => ({
        ...mapa[id],
        fornecedor: fornecedores?.find(f => f.id === id) || { nome: 'Fornecedor', categoria: '' },
      }))
      .sort((a, b) => new Date(b.ultima_hora).getTime() - new Date(a.ultima_hora).getTime())

    setConversasFornecedores(lista)
  }

  const naoLidasClientes = conversasClientes.reduce((s, c) => s + c.nao_lidas, 0)
  const naoLidasFornecedores = conversasFornecedores.reduce((s, c) => s + c.nao_lidas, 0)

  if (loading) return (
    <main className="min-h-screen bg-gray-950 flex items-center justify-center">
      <p className="text-gray-400">Carregando...</p>
    </main>
  )
  if (!loja) return null

  return (
    <AppLayout loja={loja} sair={sair} titulo="Mensagens">
      {/* Abas */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setAba('clientes')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition ${
            aba === 'clientes' ? 'bg-green-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
          }`}
        >
          <Users size={16} />
          Clientes
          {naoLidasClientes > 0 && (
            <span className="bg-white text-green-700 text-xs rounded-full px-1.5 font-bold">{naoLidasClientes}</span>
          )}
        </button>
        <button
          onClick={() => setAba('fornecedores')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition ${
            aba === 'fornecedores' ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
          }`}
        >
          <MessageCircle size={16} />
          Fornecedores
          {naoLidasFornecedores > 0 && (
            <span className="bg-white text-purple-700 text-xs rounded-full px-1.5 font-bold">{naoLidasFornecedores}</span>
          )}
        </button>
      </div>

      {carregando ? (
        <div className="text-center py-12 text-gray-500">Carregando...</div>
      ) : aba === 'clientes' ? (
        conversasClientes.length === 0 ? (
          <div className="text-center py-20 text-gray-500 flex flex-col items-center gap-3">
            <Users size={40} className="opacity-30" />
            <p>Nenhuma mensagem de cliente ainda.</p>
            <p className="text-sm">Quando um cliente mandar mensagem, aparece aqui.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {conversasClientes.map(c => (
              <button
                key={c.cliente_id}
                onClick={() => router.push(`/mensagens/cliente/${c.cliente_id}`)}
                className="bg-gray-900 rounded-2xl p-4 text-left hover:bg-gray-800 transition flex items-center gap-3"
              >
                <div className="w-10 h-10 bg-green-900 rounded-full flex items-center justify-center shrink-0">
                  <Users size={18} className="text-green-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-white font-semibold truncate">{c.cliente.nome}</p>
                    <p className="text-gray-500 text-xs shrink-0">
                      {new Date(c.ultima_hora).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                    </p>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <p className="text-gray-400 text-sm truncate">{c.ultima_mensagem}</p>
                    {c.nao_lidas > 0 && (
                      <span className="bg-green-600 text-white text-xs rounded-full px-1.5 py-0.5 shrink-0 min-w-[20px] text-center font-bold">
                        {c.nao_lidas}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )
      ) : (
        conversasFornecedores.length === 0 ? (
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
            {conversasFornecedores.map(c => (
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
        )
      )}
    </AppLayout>
  )
}
