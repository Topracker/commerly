'use client'
import { useState, useEffect } from 'react'
import { useFornecedor } from '../../hooks/useFornecedor'
import { useToast } from '../../hooks/useToast'
import { FornecedorLayout } from '../../components/FornecedorLayout'
import { Toast } from '../../components/Toast'

const CATEGORIAS = [
  'Alimentos e bebidas',
  'Limpeza e higiene',
  'Eletrônicos',
  'Roupas e acessórios',
  'Papelaria',
  'Construção',
  'Serviços',
  'Tecnologia',
  'Outro',
]

export default function FornecedorConfiguracoes() {
  const { fornecedor, loading, supabase, sair } = useFornecedor()
  const { toast, mostrarToast } = useToast()
  const [nome, setNome] = useState('')
  const [categoria, setCategoria] = useState('')
  const [descricao, setDescricao] = useState('')
  const [telefone, setTelefone] = useState('')
  const [localizacao, setLocalizacao] = useState('')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    if (fornecedor) {
      setNome(fornecedor.nome || '')
      setCategoria(fornecedor.categoria || '')
      setDescricao(fornecedor.descricao || '')
      setTelefone(fornecedor.telefone || '')
      setLocalizacao(fornecedor.localizacao || '')
    }
  }, [fornecedor])

  async function salvar() {
    if (!nome.trim() || !categoria) {
      mostrarToast('Nome e categoria são obrigatórios!', 'erro')
      return
    }
    setSalvando(true)
    const { error } = await supabase
      .from('fornecedores')
      .update({
        nome: nome.trim(),
        categoria,
        descricao: descricao.trim() || null,
        telefone: telefone.trim() || null,
        localizacao: localizacao.trim() || null,
      })
      .eq('id', fornecedor.id)
    if (error) mostrarToast('Erro ao salvar configurações', 'erro')
    else mostrarToast('Configurações salvas!', 'sucesso')
    setSalvando(false)
  }

  if (loading) return (
    <main className="min-h-screen bg-gray-950 flex items-center justify-center">
      <p className="text-gray-400">Carregando...</p>
    </main>
  )
  if (!fornecedor) return null

  return (
    <FornecedorLayout fornecedor={fornecedor} sair={sair} titulo="Configurações">
      <Toast toast={toast} />
      <div className="bg-gray-900 rounded-2xl p-6 flex flex-col gap-5">
        <div>
          <label className="text-gray-400 text-sm block mb-1.5">Nome da empresa *</label>
          <input
            value={nome}
            onChange={e => setNome(e.target.value)}
            className="w-full bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>

        <div>
          <label className="text-gray-400 text-sm block mb-1.5">Categoria *</label>
          <select
            value={categoria}
            onChange={e => setCategoria(e.target.value)}
            className="w-full bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-purple-500"
          >
            <option value="">Selecione...</option>
            {CATEGORIAS.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-gray-400 text-sm block mb-1.5">Descrição</label>
          <textarea
            value={descricao}
            onChange={e => setDescricao(e.target.value)}
            rows={3}
            placeholder="Descreva sua empresa..."
            className="w-full bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-purple-500 resize-none"
          />
        </div>

        <div>
          <label className="text-gray-400 text-sm block mb-1.5">Telefone / WhatsApp</label>
          <input
            value={telefone}
            onChange={e => setTelefone(e.target.value)}
            placeholder="(00) 00000-0000"
            className="w-full bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>

        <div>
          <label className="text-gray-400 text-sm block mb-1.5">Localização</label>
          <input
            value={localizacao}
            onChange={e => setLocalizacao(e.target.value)}
            placeholder="Cidade, bairro ou endereço"
            className="w-full bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>

        <button
          onClick={salvar}
          disabled={salvando}
          className="bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition"
        >
          {salvando ? 'Salvando...' : 'Salvar configurações'}
        </button>
      </div>
    </FornecedorLayout>
  )
}
