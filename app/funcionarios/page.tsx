'use client'
import { useState, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import { AppLayout } from '../components/AppLayout'
import { Toast } from '../components/Toast'
import { ConfirmModal } from '../components/ConfirmModal'

export default function Funcionarios() {
  const { loja, loading, supabase, sair } = useAuth()
  const { toast, mostrarToast } = useToast()
  const [funcionarios, setFuncionarios] = useState<any[]>([])
  const [modal, setModal] = useState(false)
  const [confirmarId, setConfirmarId] = useState<string | null>(null)
  const [nome, setNome] = useState('')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => { if (loja) carregar() }, [loja])

  async function carregar() {
    const { data, error } = await supabase.from('funcionarios').select('*').eq('loja_id', loja.id).order('created_at', { ascending: false })
    if (error) { mostrarToast('Erro ao carregar funcionários', 'erro'); return }
    setFuncionarios(data || [])
  }

  async function salvar() {
    if (!nome) { mostrarToast('Digite o nome!', 'erro'); return }
    setSalvando(true)
    const { error } = await supabase.from('funcionarios').insert({ loja_id: loja.id, nome })
    if (error) { mostrarToast('Erro ao salvar funcionário', 'erro'); setSalvando(false); return }
    mostrarToast('Funcionário adicionado!', 'sucesso')
    setNome('')
    setModal(false)
    setSalvando(false)
    carregar()
  }

  async function remover() {
    if (!confirmarId) return
    const { error } = await supabase.from('funcionarios').delete().eq('id', confirmarId)
    if (error) { mostrarToast('Erro ao remover funcionário', 'erro') }
    else { mostrarToast('Funcionário removido', 'sucesso') }
    setConfirmarId(null)
    carregar()
  }

  if (loading) return (
    <main className="min-h-screen bg-gray-950 flex items-center justify-center">
      <p className="text-gray-400">Carregando...</p>
    </main>
  )
  if (!loja) return null

  return (
    <AppLayout loja={loja} sair={sair} titulo="Funcionários">
      <Toast toast={toast} />
      <ConfirmModal
        aberto={!!confirmarId}
        titulo="Remover funcionário"
        mensagem="Tem certeza que deseja remover este funcionário?"
        textoBotao="Remover"
        onConfirm={remover}
        onCancel={() => setConfirmarId(null)}
      />

      <div className="flex items-center justify-between mb-6">
        <p className="text-gray-400 text-sm">Total: {funcionarios.length}</p>
        <button onClick={() => setModal(true)} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl transition">
          + Adicionar
        </button>
      </div>

      {funcionarios.length === 0 ? (
        <div className="text-center text-gray-500 py-20">Nenhum funcionário cadastrado.</div>
      ) : (
        <div className="flex flex-col gap-3">
          {funcionarios.map(f => (
            <div key={f.id} className="bg-gray-900 rounded-2xl p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-900 rounded-full flex items-center justify-center text-blue-300 font-bold">
                  {f.nome.charAt(0).toUpperCase()}
                </div>
                <p className="text-white font-semibold">{f.nome}</p>
              </div>
              <button onClick={() => setConfirmarId(f.id)} className="bg-red-900 hover:bg-red-800 text-red-300 px-3 py-1.5 rounded-lg text-sm transition">Remover</button>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center p-6 z-50">
          <div className="bg-gray-900 rounded-3xl p-8 w-full max-w-md">
            <h2 className="text-xl font-bold text-white mb-6">Novo funcionário</h2>
            <div className="flex flex-col gap-4">
              <input
                placeholder="Nome *"
                value={nome}
                onChange={e => setNome(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && salvar()}
                className="bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
              />
              <div className="flex gap-3">
                <button onClick={() => setModal(false)} className="flex-1 bg-gray-800 text-white py-3 rounded-xl hover:bg-gray-700 transition">Cancelar</button>
                <button onClick={salvar} disabled={salvando} className="flex-1 bg-blue-600 text-white font-semibold py-3 rounded-xl hover:bg-blue-700 transition">
                  {salvando ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
