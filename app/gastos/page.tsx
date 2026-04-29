'use client'
import { useState, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import { AppLayout } from '../components/AppLayout'
import { Toast } from '../components/Toast'
import { ConfirmModal } from '../components/ConfirmModal'

const tipos = ['Aluguel', 'Conta de luz', 'Conta de água', 'Internet', 'Compras', 'Salário', 'Outro']

export default function Gastos() {
  const { loja, loading, supabase, sair } = useAuth()
  const { toast, mostrarToast } = useToast()
  const [gastos, setGastos] = useState<any[]>([])
  const [modal, setModal] = useState(false)
  const [confirmarId, setConfirmarId] = useState<string | null>(null)
  const [descricao, setDescricao] = useState('')
  const [valor, setValor] = useState('')
  const [tipo, setTipo] = useState('')
  const [periodo, setPeriodo] = useState('mes')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => { if (loja) carregar() }, [loja, periodo])

  async function carregar() {
    const agora = new Date()
    let desde = new Date()
    if (periodo === 'hoje') desde.setHours(0, 0, 0, 0)
    else if (periodo === 'semana') desde.setDate(agora.getDate() - 7)
    else if (periodo === 'mes') desde.setDate(1)

    let query = supabase.from('gastos').select('*').eq('loja_id', loja.id).order('created_at', { ascending: false })
    if (periodo !== 'todos') query = query.gte('created_at', desde.toISOString())

    const { data, error } = await query
    if (error) { mostrarToast('Erro ao carregar gastos', 'erro'); return }
    setGastos(data || [])
  }

  async function salvar() {
    if (!descricao || !valor || !tipo) {
      mostrarToast('Preencha todos os campos!', 'erro'); return
    }
    setSalvando(true)
    const { error } = await supabase.from('gastos').insert({
      loja_id: loja.id,
      descricao,
      valor: parseFloat(valor),
      tipo
    })
    if (error) { mostrarToast('Erro ao salvar gasto', 'erro'); setSalvando(false); return }
    mostrarToast('Gasto registrado!', 'sucesso')
    setModal(false)
    setDescricao(''); setValor(''); setTipo('')
    setSalvando(false)
    carregar()
  }

  async function remover() {
    if (!confirmarId) return
    const { error } = await supabase.from('gastos').delete().eq('id', confirmarId)
    if (error) { mostrarToast('Erro ao remover gasto', 'erro') }
    else { mostrarToast('Gasto removido', 'sucesso') }
    setConfirmarId(null)
    carregar()
  }

  const total = gastos.reduce((a, g) => a + g.valor, 0)

  if (loading) return (
    <main className="min-h-screen bg-gray-950 flex items-center justify-center">
      <p className="text-gray-400">Carregando...</p>
    </main>
  )
  if (!loja) return null

  return (
    <AppLayout loja={loja} sair={sair} titulo="Gastos">
      <Toast toast={toast} />
      <ConfirmModal
        aberto={!!confirmarId}
        titulo="Remover gasto"
        mensagem="Tem certeza que deseja remover este gasto?"
        textoBotao="Remover"
        onConfirm={remover}
        onCancel={() => setConfirmarId(null)}
      />

      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-2">
          {[['hoje', 'Hoje'], ['semana', 'Semana'], ['mes', 'Mês'], ['todos', 'Todos']].map(([val, label]) => (
            <button key={val} onClick={() => setPeriodo(val)}
              className={`px-3 py-2 rounded-xl text-sm font-semibold transition ${periodo === val ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
              {label}
            </button>
          ))}
        </div>
        <button onClick={() => setModal(true)} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl transition">
          + Adicionar
        </button>
      </div>

      <div className="bg-gray-900 rounded-2xl p-6 mb-6">
        <p className="text-gray-400 text-sm mb-1">Total de gastos</p>
        <p className="text-3xl font-bold text-red-400">R$ {total.toFixed(2)}</p>
      </div>

      {gastos.length === 0 ? (
        <div className="text-center text-gray-500 py-20">Nenhum gasto neste período.</div>
      ) : (
        <div className="flex flex-col gap-3">
          {gastos.map(g => (
            <div key={g.id} className="bg-gray-900 rounded-2xl p-4 flex items-center justify-between">
              <div>
                <p className="text-white font-semibold">{g.descricao}</p>
                <p className="text-gray-400 text-sm">{g.tipo} — {new Date(g.created_at).toLocaleDateString('pt-BR')}</p>
              </div>
              <div className="flex items-center gap-3">
                <p className="text-red-400 font-semibold">R$ {g.valor.toFixed(2)}</p>
                <button onClick={() => setConfirmarId(g.id)} className="bg-red-900 hover:bg-red-800 text-red-300 px-3 py-1.5 rounded-lg text-sm transition">Remover</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center p-6 z-50">
          <div className="bg-gray-900 rounded-3xl p-8 w-full max-w-md">
            <h2 className="text-xl font-bold text-white mb-6">Novo gasto</h2>
            <div className="flex flex-col gap-4">
              <input
                placeholder="Descrição *"
                value={descricao}
                onChange={e => setDescricao(e.target.value)}
                className="bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
              />
              <select
                value={tipo}
                onChange={e => setTipo(e.target.value)}
                className="bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Tipo de gasto *</option>
                {tipos.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <input
                placeholder="Valor *"
                type="number"
                value={valor}
                onChange={e => setValor(e.target.value)}
                className="bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
              />
              <div className="flex gap-3 mt-2">
                <button onClick={() => setModal(false)} className="flex-1 bg-gray-800 hover:bg-gray-700 text-white py-3 rounded-xl transition">Cancelar</button>
                <button onClick={salvar} disabled={salvando} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition">
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
