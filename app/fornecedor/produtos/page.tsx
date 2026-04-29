'use client'
import { useState, useEffect } from 'react'
import { useFornecedor } from '../../hooks/useFornecedor'
import { useToast } from '../../hooks/useToast'
import { FornecedorLayout } from '../../components/FornecedorLayout'
import { Toast } from '../../components/Toast'
import { ConfirmModal } from '../../components/ConfirmModal'

export default function FornecedorProdutos() {
  const { fornecedor, loading, supabase, sair } = useFornecedor()
  const { toast, mostrarToast } = useToast()
  const [produtos, setProdutos] = useState<any[]>([])
  const [modal, setModal] = useState(false)
  const [confirmarId, setConfirmarId] = useState<string | null>(null)
  const [editando, setEditando] = useState<any>(null)
  const [nome, setNome] = useState('')
  const [descricao, setDescricao] = useState('')
  const [preco, setPreco] = useState('')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => { if (fornecedor) carregar() }, [fornecedor])

  async function carregar() {
    const { data, error } = await supabase.from('fornecedor_produtos').select('*').eq('fornecedor_id', fornecedor.id).order('created_at', { ascending: false })
    if (error) { mostrarToast('Erro ao carregar produtos', 'erro'); return }
    setProdutos(data || [])
  }

  function abrirModal(produto?: any) {
    if (produto) {
      setEditando(produto)
      setNome(produto.nome)
      setDescricao(produto.descricao || '')
      setPreco(produto.preco)
    } else {
      setEditando(null)
      setNome(''); setDescricao(''); setPreco('')
    }
    setModal(true)
  }

  async function salvar() {
    if (!nome.trim() || !preco) { mostrarToast('Nome e preço são obrigatórios!', 'erro'); return }
    setSalvando(true)
    const dados = {
      fornecedor_id: fornecedor.id,
      nome: nome.trim(),
      descricao: descricao.trim(),
      preco: parseFloat(preco),
    }
    const { error } = editando
      ? await supabase.from('fornecedor_produtos').update(dados).eq('id', editando.id)
      : await supabase.from('fornecedor_produtos').insert(dados)
    if (error) { mostrarToast('Erro ao salvar', 'erro'); setSalvando(false); return }
    mostrarToast(editando ? 'Produto atualizado!' : 'Produto cadastrado!', 'sucesso')
    setModal(false)
    setSalvando(false)
    carregar()
  }

  async function remover() {
    if (!confirmarId) return
    const { error } = await supabase.from('fornecedor_produtos').delete().eq('id', confirmarId)
    if (error) { mostrarToast('Erro ao remover', 'erro') }
    else { mostrarToast('Produto removido', 'sucesso') }
    setConfirmarId(null)
    carregar()
  }

  if (loading) return (
    <main className="min-h-screen bg-gray-950 flex items-center justify-center">
      <p className="text-gray-400">Carregando...</p>
    </main>
  )
  if (!fornecedor) return null

  return (
    <FornecedorLayout fornecedor={fornecedor} sair={sair} titulo="Produtos & Serviços">
      <Toast toast={toast} />
      <ConfirmModal
        aberto={!!confirmarId}
        titulo="Remover produto"
        mensagem="Tem certeza que deseja remover este produto?"
        textoBotao="Remover"
        onConfirm={remover}
        onCancel={() => setConfirmarId(null)}
      />

      <div className="flex items-center justify-between mb-6">
        <p className="text-gray-400 text-sm">{produtos.length} produto{produtos.length !== 1 ? 's' : ''} cadastrado{produtos.length !== 1 ? 's' : ''}</p>
        <button onClick={() => abrirModal()} className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-xl transition">
          + Adicionar
        </button>
      </div>

      {produtos.length === 0 ? (
        <div className="text-center text-gray-500 py-20">
          <p className="mb-2">Nenhum produto cadastrado ainda.</p>
          <p className="text-sm">Adicione produtos e serviços que sua empresa oferece.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {produtos.map(p => (
            <div key={p.id} className="bg-gray-900 rounded-2xl p-4 flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                <p className="text-white font-semibold">{p.nome}</p>
                {p.descricao && <p className="text-gray-400 text-sm mt-0.5 line-clamp-2">{p.descricao}</p>}
                <p className="text-purple-400 font-bold mt-1">R$ {parseFloat(p.preco).toFixed(2)}</p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button onClick={() => abrirModal(p)} className="bg-gray-800 hover:bg-gray-700 text-white px-3 py-1.5 rounded-lg text-sm transition">Editar</button>
                <button onClick={() => setConfirmarId(p.id)} className="bg-red-900 hover:bg-red-800 text-red-300 px-3 py-1.5 rounded-lg text-sm transition">Remover</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-900 rounded-3xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold text-white mb-6">{editando ? 'Editar produto' : 'Novo produto/serviço'}</h2>
            <div className="flex flex-col gap-4">
              <input
                placeholder="Nome do produto/serviço *"
                value={nome}
                onChange={e => setNome(e.target.value)}
                className="bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-purple-500"
              />
              <textarea
                placeholder="Descrição (opcional)"
                value={descricao}
                onChange={e => setDescricao(e.target.value)}
                rows={3}
                className="bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-purple-500 resize-none"
              />
              <input
                placeholder="Preço *"
                type="number"
                value={preco}
                onChange={e => setPreco(e.target.value)}
                className="bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-purple-500"
              />
              <div className="flex gap-3 mt-2">
                <button onClick={() => setModal(false)} className="flex-1 bg-gray-800 hover:bg-gray-700 text-white py-3 rounded-xl transition">Cancelar</button>
                <button onClick={salvar} disabled={salvando} className="flex-1 bg-purple-600 hover:bg-purple-700 text-white font-semibold py-3 rounded-xl transition">
                  {salvando ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </FornecedorLayout>
  )
}
