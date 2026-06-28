'use client'
import { useState, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import { AppLayout } from '../components/AppLayout'
import { Toast } from '../components/Toast'
import { ConfirmModal } from '../components/ConfirmModal'
import { carregarServicos, salvarServico, removerServico, type Servico } from '../lib/nicheStore'

export default function Servicos() {
  const { loja, loading, sair } = useAuth()
  const { toast, mostrarToast } = useToast()

  const [servicos, setServicos] = useState<Servico[]>([])
  const [modal, setModal] = useState(false)
  const [editando, setEditando] = useState<Servico | null>(null)
  const [confirmarId, setConfirmarId] = useState<string | null>(null)

  const [nome, setNome] = useState('')
  const [preco, setPreco] = useState('')
  const [duracao, setDuracao] = useState('30')

  useEffect(() => {
    if (!loja) return
    let ativo = true
    carregarServicos(loja.id)
      .then(lista => { if (ativo) setServicos(lista) })
      .catch(() => { if (ativo) mostrarToast('Erro ao carregar os serviços', 'erro') })
    return () => { ativo = false }
  }, [loja])

  function abrirModal(s?: Servico) {
    if (s) {
      setEditando(s)
      setNome(s.nome); setPreco(String(s.preco)); setDuracao(String(s.duracao))
    } else {
      setEditando(null)
      setNome(''); setPreco(''); setDuracao('30')
    }
    setModal(true)
  }

  async function salvar() {
    if (!nome.trim() || !preco) {
      mostrarToast('Informe o nome e o preço!', 'erro'); return
    }
    try {
      const lista = await salvarServico(loja.id, {
        id: editando?.id,
        nome: nome.trim(),
        preco: parseFloat(preco) || 0,
        duracao: parseInt(duracao) || 0,
      })
      setServicos(lista)
      setModal(false)
      mostrarToast(editando ? 'Serviço atualizado!' : 'Serviço cadastrado!', 'sucesso')
    } catch {
      mostrarToast('Erro ao salvar o serviço', 'erro')
    }
  }

  async function remover() {
    if (!confirmarId) return
    try {
      const lista = await removerServico(loja.id, confirmarId)
      setServicos(lista)
      setConfirmarId(null)
      mostrarToast('Serviço removido', 'sucesso')
    } catch {
      mostrarToast('Erro ao remover o serviço', 'erro')
    }
  }

  if (loading) return (
    <main className="min-h-screen bg-gray-950 flex items-center justify-center">
      <p className="text-gray-400">Carregando...</p>
    </main>
  )
  if (!loja) return null

  return (
    <AppLayout loja={loja} sair={sair} titulo="Serviços">
      <Toast toast={toast} />
      <ConfirmModal
        aberto={!!confirmarId}
        titulo="Remover serviço"
        mensagem="Tem certeza que deseja remover este serviço?"
        textoBotao="Remover"
        onConfirm={remover}
        onCancel={() => setConfirmarId(null)}
      />

      <div className="flex items-center justify-between mb-6">
        <p className="text-gray-400 text-sm">{servicos.length} serviço(s)</p>
        <button onClick={() => abrirModal()} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl transition">
          + Adicionar
        </button>
      </div>

      {servicos.length === 0 ? (
        <div className="text-center text-gray-500 py-20">
          <p className="text-4xl mb-3">✂️</p>
          Nenhum serviço cadastrado. Cadastre os serviços que você oferece e seus preços.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {servicos.map(s => (
            <div key={s.id} className="bg-gray-900 rounded-2xl p-4 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-gray-800 flex items-center justify-center shrink-0 text-2xl">✂️</div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-semibold">{s.nome}</p>
                <div className="flex gap-4 mt-1 flex-wrap">
                  <p className="text-green-400 text-sm">R$ {s.preco.toFixed(2)}</p>
                  {s.duracao > 0 && <p className="text-gray-400 text-sm">{s.duracao} min</p>}
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <button onClick={() => abrirModal(s)} className="bg-gray-800 hover:bg-gray-700 text-white px-3 py-1.5 rounded-lg text-sm transition">Editar</button>
                <button onClick={() => setConfirmarId(s.id)} className="bg-red-900 hover:bg-red-800 text-red-300 px-3 py-1.5 rounded-lg text-sm transition">Remover</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-900 rounded-3xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold text-white mb-6">{editando ? 'Editar serviço' : 'Novo serviço'}</h2>
            <div className="flex flex-col gap-4">
              <input placeholder="Nome do serviço * (ex: Corte masculino)" value={nome} onChange={e => setNome(e.target.value)} className="bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500" />
              <input placeholder="Preço *" type="number" value={preco} onChange={e => setPreco(e.target.value)} className="bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500" />
              <input placeholder="Duração (minutos)" type="number" value={duracao} onChange={e => setDuracao(e.target.value)} className="bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500" />
              <div className="flex gap-3 mt-2">
                <button onClick={() => setModal(false)} className="flex-1 bg-gray-800 hover:bg-gray-700 text-white py-3 rounded-xl transition">Cancelar</button>
                <button onClick={salvar} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition">Salvar</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
