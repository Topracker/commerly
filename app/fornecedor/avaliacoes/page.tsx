'use client'
import { useEffect, useState } from 'react'
import { useFornecedor } from '../../hooks/useFornecedor'
import { FornecedorLayout } from '../../components/FornecedorLayout'
import { Estrelas } from '../../components/Estrelas'
import { Star } from 'lucide-react'

export default function FornecedorAvaliacoes() {
  const { fornecedor, loading, supabase, sair } = useFornecedor()
  const [avaliacoes, setAvaliacoes] = useState<any[]>([])
  const [media, setMedia] = useState(0)
  const [carregando, setCarregando] = useState(false)

  useEffect(() => {
    if (fornecedor) carregar()
  }, [fornecedor])

  async function carregar() {
    setCarregando(true)
    const { data } = await supabase
      .from('avaliacoes_fornecedores')
      .select('nota, comentario, created_at')
      .eq('fornecedor_id', fornecedor.id)
      .order('created_at', { ascending: false })
    const avals = data || []
    setAvaliacoes(avals)
    setMedia(avals.length > 0 ? avals.reduce((s: number, a: any) => s + a.nota, 0) / avals.length : 0)
    setCarregando(false)
  }

  if (loading) return (
    <main className="min-h-screen bg-gray-950 flex items-center justify-center">
      <p className="text-gray-400">Carregando...</p>
    </main>
  )
  if (!fornecedor) return null

  return (
    <FornecedorLayout fornecedor={fornecedor} sair={sair} titulo="Avaliações">
      {carregando ? (
        <div className="text-center py-12 text-gray-500">Carregando...</div>
      ) : (
        <>
          {avaliacoes.length > 0 && (
            <div className="bg-gray-900 rounded-2xl p-5 mb-5 flex items-center gap-5">
              <div className="text-center">
                <p className="text-5xl font-bold text-white">{media.toFixed(1)}</p>
                <Estrelas nota={Math.round(media)} tamanho="text-base" />
              </div>
              <div className="text-gray-400 text-sm">
                <p>{avaliacoes.length} avaliaç{avaliacoes.length !== 1 ? 'ões' : 'ão'} recebida{avaliacoes.length !== 1 ? 's' : ''}</p>
                {[5, 4, 3, 2, 1].map(n => {
                  const count = avaliacoes.filter(a => a.nota === n).length
                  const pct = avaliacoes.length > 0 ? (count / avaliacoes.length) * 100 : 0
                  return (
                    <div key={n} className="flex items-center gap-2 mt-1">
                      <span className="w-3 text-right">{n}</span>
                      <Star size={10} className="text-yellow-400 fill-yellow-400 shrink-0" />
                      <div className="w-24 bg-gray-800 rounded-full h-1.5">
                        <div className="bg-yellow-400 h-1.5 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs text-gray-500">{count}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {avaliacoes.length === 0 ? (
            <div className="bg-gray-900 rounded-2xl p-10 text-center text-gray-500">
              <Star size={32} className="mx-auto mb-3 text-gray-700" />
              <p>Nenhuma avaliação ainda.</p>
              <p className="text-sm mt-1">Compartilhe seu perfil para receber avaliações.</p>
            </div>
          ) : (
            <div className="bg-gray-900 rounded-2xl p-5">
              <h2 className="text-white font-semibold mb-4">Todas as avaliações</h2>
              <div className="flex flex-col gap-4">
                {avaliacoes.map((a, i) => (
                  <div key={i} className={`${i < avaliacoes.length - 1 ? 'border-b border-gray-800 pb-4' : ''}`}>
                    <div className="flex items-center justify-between mb-1">
                      <Estrelas nota={a.nota} tamanho="text-base" />
                      <span className="text-gray-500 text-xs">
                        {new Date(a.created_at).toLocaleDateString('pt-BR')}
                      </span>
                    </div>
                    {a.comentario
                      ? <p className="text-gray-300 text-sm">{a.comentario}</p>
                      : <p className="text-gray-600 text-sm italic">Sem comentário</p>
                    }
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </FornecedorLayout>
  )
}
