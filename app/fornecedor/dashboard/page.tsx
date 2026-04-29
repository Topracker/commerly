'use client'
import { useEffect, useState } from 'react'
import { useFornecedor } from '../../hooks/useFornecedor'
import { FornecedorLayout } from '../../components/FornecedorLayout'
import { Estrelas } from '../../components/Estrelas'
import { Eye, MessageCircle, Star, TrendingUp } from 'lucide-react'

export default function FornecedorDashboard() {
  const { fornecedor, loading, supabase, sair } = useFornecedor()
  const [stats, setStats] = useState({ views: 0, contatos: 0, mediaAval: 0, totalAval: 0 })
  const [avaliacoes, setAvaliacoes] = useState<any[]>([])
  const [carregando, setCarregando] = useState(false)

  useEffect(() => {
    if (fornecedor) carregarStats()
  }, [fornecedor])

  async function carregarStats() {
    setCarregando(true)
    const [viewsRes, contatosRes, avalRes] = await Promise.all([
      supabase.from('visualizacoes_fornecedor').select('id', { count: 'exact' }).eq('fornecedor_id', fornecedor.id),
      supabase.from('contatos_fornecedor').select('id', { count: 'exact' }).eq('fornecedor_id', fornecedor.id),
      supabase.from('avaliacoes_fornecedores').select('nota, comentario, created_at').eq('fornecedor_id', fornecedor.id).order('created_at', { ascending: false }),
    ])

    const avals = avalRes.data || []
    const media = avals.length > 0 ? avals.reduce((s: number, a: any) => s + a.nota, 0) / avals.length : 0
    setStats({
      views: viewsRes.count || 0,
      contatos: contatosRes.count || 0,
      mediaAval: media,
      totalAval: avals.length,
    })
    setAvaliacoes(avals)
    setCarregando(false)
  }

  if (loading) return (
    <main className="min-h-screen bg-gray-950 flex items-center justify-center">
      <p className="text-gray-400">Carregando...</p>
    </main>
  )
  if (!fornecedor) return null

  return (
    <FornecedorLayout fornecedor={fornecedor} sair={sair} titulo="Dashboard">
      {carregando ? (
        <div className="text-center py-12 text-gray-500">Carregando...</div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 mb-6">
            <div className="bg-gray-900 rounded-2xl p-4 flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-900 rounded-xl flex items-center justify-center">
                <Eye size={18} className="text-blue-400" />
              </div>
              <div>
                <p className="text-gray-400 text-xs">Visualizações</p>
                <p className="text-white text-2xl font-bold">{stats.views}</p>
              </div>
            </div>

            <div className="bg-gray-900 rounded-2xl p-4 flex items-center gap-3">
              <div className="w-10 h-10 bg-green-900 rounded-xl flex items-center justify-center">
                <MessageCircle size={18} className="text-green-400" />
              </div>
              <div>
                <p className="text-gray-400 text-xs">Contatos</p>
                <p className="text-white text-2xl font-bold">{stats.contatos}</p>
              </div>
            </div>

            <div className="bg-gray-900 rounded-2xl p-4 flex items-center gap-3">
              <div className="w-10 h-10 bg-yellow-900 rounded-xl flex items-center justify-center">
                <Star size={18} className="text-yellow-400" />
              </div>
              <div>
                <p className="text-gray-400 text-xs">Nota média</p>
                <p className="text-white text-2xl font-bold">
                  {stats.totalAval > 0 ? stats.mediaAval.toFixed(1) : '—'}
                </p>
              </div>
            </div>

            <div className="bg-gray-900 rounded-2xl p-4 flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-900 rounded-xl flex items-center justify-center">
                <TrendingUp size={18} className="text-purple-400" />
              </div>
              <div>
                <p className="text-gray-400 text-xs">Avaliações</p>
                <p className="text-white text-2xl font-bold">{stats.totalAval}</p>
              </div>
            </div>
          </div>

          <div className="bg-gray-900 rounded-2xl p-5 mb-6">
            <h2 className="text-white font-semibold mb-2">Seu perfil público</h2>
            <p className="text-gray-400 text-sm mb-3">Compartilhe o link do seu perfil com clientes e comércios.</p>
            <div className="flex gap-2">
              <input
                readOnly
                value={typeof window !== 'undefined' ? `${window.location.origin}/fornecedor/${fornecedor.id}` : ''}
                className="flex-1 bg-gray-800 text-gray-300 rounded-xl px-4 py-2 text-sm outline-none"
              />
              <button
                onClick={() => navigator.clipboard?.writeText(`${window.location.origin}/fornecedor/${fornecedor.id}`)}
                className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-xl text-sm transition"
              >
                Copiar
              </button>
            </div>
          </div>

          {avaliacoes.length > 0 && (
            <div className="bg-gray-900 rounded-2xl p-5">
              <h2 className="text-white font-semibold mb-4">Avaliações recebidas</h2>
              <div className="flex flex-col gap-3">
                {avaliacoes.map((a, i) => (
                  <div key={i} className="border-b border-gray-800 pb-3">
                    <div className="flex items-center gap-2 mb-1">
                      <Estrelas nota={a.nota} tamanho="text-base" />
                      <span className="text-gray-500 text-xs">{new Date(a.created_at).toLocaleDateString('pt-BR')}</span>
                    </div>
                    {a.comentario && <p className="text-gray-300 text-sm">{a.comentario}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {avaliacoes.length === 0 && (
            <div className="bg-gray-900 rounded-2xl p-8 text-center text-gray-500">
              Nenhuma avaliação ainda. Compartilhe seu perfil para receber avaliações!
            </div>
          )}
        </>
      )}
    </FornecedorLayout>
  )
}
