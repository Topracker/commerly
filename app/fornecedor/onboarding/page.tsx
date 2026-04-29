'use client'
import { useState, useEffect } from 'react'
import { createClient } from '../../supabase'
import { useRouter } from 'next/navigation'

const CATEGORIAS = ['Alimentos e bebidas', 'Limpeza e higiene', 'Eletrônicos', 'Roupas e acessórios', 'Papelaria', 'Construção', 'Serviços', 'Tecnologia', 'Outro']

export default function FornecedorOnboarding() {
  const [nome, setNome] = useState('')
  const [categoria, setCategoria] = useState('')
  const [localizacao, setLocalizacao] = useState('')
  const [telefone, setTelefone] = useState('')
  const [instagram, setInstagram] = useState('')
  const [descricao, setDescricao] = useState('')
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) router.push('/fornecedor/login')
    })
  }, [])

  async function salvar() {
    if (!nome.trim() || !categoria) { setErro('Nome e categoria são obrigatórios!'); return }
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('fornecedores').insert({
      user_id: user!.id,
      nome: nome.trim(),
      categoria,
      localizacao,
      telefone,
      instagram,
      descricao,
    })
    if (error) { setErro('Erro ao salvar. Tente novamente.'); setLoading(false); return }
    router.push('/fornecedor/dashboard')
  }

  return (
    <main className="min-h-screen bg-gray-950 flex items-center justify-center p-6">
      <div className="bg-gray-900 rounded-3xl p-8 w-full max-w-md">
        <p className="text-purple-400 text-sm font-semibold mb-1">Área do Fornecedor</p>
        <h1 className="text-2xl font-bold text-white mb-1">Cadastro da empresa</h1>
        <p className="text-gray-400 mb-6">Conte sobre o seu negócio</p>

        {erro && <p className="text-red-400 text-sm mb-4">{erro}</p>}

        <div className="flex flex-col gap-4">
          <input
            placeholder="Nome da empresa *"
            value={nome}
            onChange={e => setNome(e.target.value)}
            className="bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-purple-500"
          />
          <select
            value={categoria}
            onChange={e => setCategoria(e.target.value)}
            className="bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-purple-500"
          >
            <option value="">Categoria *</option>
            {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <textarea
            placeholder="Descrição da empresa (opcional)"
            value={descricao}
            onChange={e => setDescricao(e.target.value)}
            rows={3}
            className="bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-purple-500 resize-none"
          />
          <input
            placeholder="Localização"
            value={localizacao}
            onChange={e => setLocalizacao(e.target.value)}
            className="bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-purple-500"
          />
          <input
            placeholder="Telefone / WhatsApp"
            value={telefone}
            onChange={e => setTelefone(e.target.value)}
            className="bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-purple-500"
          />
          <input
            placeholder="Instagram (ex: @empresa)"
            value={instagram}
            onChange={e => setInstagram(e.target.value)}
            className="bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-purple-500"
          />
          <button
            onClick={salvar}
            disabled={loading}
            className="bg-purple-600 hover:bg-purple-700 text-white font-semibold py-3 rounded-xl transition disabled:opacity-50 mt-2"
          >
            {loading ? 'Salvando...' : 'Criar perfil e começar'}
          </button>
        </div>
      </div>
    </main>
  )
}
