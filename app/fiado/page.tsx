'use client'
import { useState, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import { AppLayout } from '../components/AppLayout'
import { Toast } from '../components/Toast'
import { ConfirmModal } from '../components/ConfirmModal'

export default function Fiado() {
  const { loja, loading, supabase, sair } = useAuth()
  const { toast, mostrarToast } = useToast()
  const [fiados, setFiados] = useState<any[]>([])
  const [modal, setModal] = useState(false)
  const [confirmarId, setConfirmarId] = useState<string | null>(null)
  const [clienteNome, setClienteNome] = useState('')
  const [descricao, setDescricao] = useState('')
  const [valor, setValor] = useState('')
  const [filtro, setFiltro] = useState<'todos' | 'pendentes' | 'pagos'>('pendentes')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => { if (loja) carregar() }, [loja])

  async function carregar() {
    const { data, error } = await supabase.from('fiado').select('*').eq('loja_id', loja.id).order('created_at', { ascending: false })
    if (error) { mostrarToast('Erro ao carregar fiados', 'erro'); return }
    setFiados(data || [])
  }

  async function salvar() {
    if (!clienteNome || !descricao || !valor) {
      mostrarToast('Preencha todos os campos!', 'erro'); return
    }
    setSalvando(true)
    const { error } = await supabase.from('fiado').insert({
      loja_id: loja.id,
      cliente_nome: clienteNome,
      descricao,
      valor: parseFloat(valor)
    })
    if (error) { mostrarToast('Erro ao salvar fiado', 'erro'); setSalvando(false); return }
    mostrarToast('Fiado registrado!', 'sucesso')
    setModal(false)
    setClienteNome(''); setDescricao(''); setValor('')
    setSalvando(false)
    carregar()
  }

  async function marcarPago(id: string, pago: boolean) {
    const { error } = await supabase.from('fiado').update({ pago: !pago }).eq('id', id)
    if (error) { mostrarToast('Erro ao atualizar fiado', 'erro'); return }
    mostrarToast(!pago ? 'Marcado como pago!' : 'Marcação desfeita', 'sucesso')
    carregar()
  }

  async function remover() {
    if (!confirmarId) return
    const { error } = await supabase.from('fiado').delete().eq('id', confirmarId)
    if (error) { mostrarToast('Erro ao remover fiado', 'erro') }
    else { mostrarToast('Fiado removido', 'sucesso') }
    setConfirmarId(null)
    carregar()
  }

  const filtrados = fiados.filter(f => {
    if (filtro === 'pendentes') return !f.pago
    if (filtro === 'pagos') return f.pago
    return true
  })
  const totalPendente = fiados.filter(f => !f.pago).reduce((a, f) => a + f.valor, 0)

  if (loading) return (
    <main className="min-h-screen bg-gray-950 flex items-center justify-center">
      <p className="text-gray-400">Carregando...</p>
    </main>
  )
  if (!loja) return null

  return (
    <AppLayout loja={loja} sair={sair} titulo="Fiado">
      <Toast toast={toast} />
      <ConfirmModal
        aberto={!!confirmarId}
        titulo="Remover fiado"
        mensagem="Tem certeza que deseja remover este fiado?"
        textoBotao="Remover"
        onConfirm={remover}
        onCancel={() => setConfirmarId(null)}
      />

      <div className="flex items-center justify-between mb-4">
        <span />
        <button onClick={() => setModal(true)} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl transition">
          + Adicionar
        </button>
      </div>

      <div className="bg-gray-900 rounded-2xl p-6 mb-6">
        <p className="text-gray-400 text-sm mb-1">Total pendente</p>
        <p className="text-3xl font-bold text-red-400">R$ {totalPendente.toFixed(2)}</p>
      </div>

      <div className="flex gap-2 mb-6">
        {[['pendentes', 'Pendentes'], ['pagos', 'Pagos'], ['todos', 'Todos']].map(([val, label]) => (
          <button key={val} onClick={() => setFiltro(val as any)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition ${filtro === val ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
            {label}
          </button>
        ))}
      </div>

      {filtrados.length === 0 ? (
        <div className="text-center text-gray-500 py-20">Nenhum fiado {filtro === 'pendentes' ? 'pendente' : filtro === 'pagos' ? 'pago' : ''} ainda.</div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtrados.map(f => (
            <div key={f.id} className={`bg-gray-900 rounded-2xl p-4 flex items-center justify-between gap-4 ${f.pago ? 'opacity-60' : ''}`}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-white font-semibold">{f.cliente_nome}</p>
                  {f.pago && <span className="text-xs bg-green-900 text-green-300 px-2 py-0.5 rounded-full">Pago</span>}
                </div>
                <p className="text-gray-400 text-sm">{f.descricao}</p>
                <p className="text-red-400 font-semibold mt-1">R$ {f.valor.toFixed(2)}</p>
                <p className="text-gray-500 text-xs">{new Date(f.created_at).toLocaleDateString('pt-BR')}</p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button onClick={() => marcarPago(f.id, f.pago)}
                  className={`px-3 py-1.5 rounded-lg text-sm transition ${f.pago ? 'bg-gray-800 text-gray-400' : 'bg-green-800 hover:bg-green-700 text-green-300'}`}>
                  {f.pago ? 'Desfazer' : '✓ Pago'}
                </button>
                <button onClick={() => setConfirmarId(f.id)} className="bg-red-900 hover:bg-red-800 text-red-300 px-3 py-1.5 rounded-lg text-sm transition">
                  Remover
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-900 rounded-3xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold text-white mb-6">Novo fiado</h2>
            <div className="flex flex-col gap-4">
              <input placeholder="Nome do cliente *" value={clienteNome} onChange={e => setClienteNome(e.target.value)} className="bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500" />
              <input placeholder="O que foi fiado *" value={descricao} onChange={e => setDescricao(e.target.value)} className="bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500" />
              <input placeholder="Valor *" type="number" value={valor} onChange={e => setValor(e.target.value)} className="bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500" />
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
