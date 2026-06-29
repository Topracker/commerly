'use client'
import { useState, useEffect } from 'react'
import { useCliente } from '../../hooks/useCliente'
import { useToast } from '../../hooks/useToast'
import { Toast } from '../../components/Toast'
import { ClienteLayout } from '../../components/ClienteLayout'

export default function ClienteDashboard() {
  const { cliente, loading, supabase, sair } = useCliente()
  const { toast, mostrarToast } = useToast()

  const [nome, setNome] = useState('')
  const [cpf, setCpf] = useState('')
  const [email, setEmail] = useState('')
  const [salvandoPerfil, setSalvandoPerfil] = useState(false)

  useEffect(() => {
    if (cliente) {
      setNome(cliente.nome || '')
      setCpf(cliente.cpf || '')
      carregarEmail()
    }
  }, [cliente])

  async function carregarEmail() {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) setEmail(user.email || '')
  }

  async function salvarPerfil() {
    if (!nome.trim()) { mostrarToast('Nome é obrigatório', 'erro'); return }
    setSalvandoPerfil(true)
    const { error } = await supabase
      .from('clientes')
      .update({ nome: nome.trim(), cpf: cpf.trim() || null })
      .eq('id', cliente.id)
    if (error) mostrarToast('Erro ao salvar perfil', 'erro')
    else mostrarToast('Perfil atualizado!', 'sucesso')
    setSalvandoPerfil(false)
  }

  if (loading) return (
    <main className="min-h-screen bg-gray-950 flex items-center justify-center">
      <p className="text-gray-400">Carregando...</p>
    </main>
  )
  if (!cliente) return null

  return (
    <ClienteLayout cliente={cliente} sair={sair}>
      <Toast toast={toast} />
      <h1 className="text-2xl font-bold text-white mb-6 hidden md:block">Minha conta</h1>

      <div className="max-w-2xl mx-auto">
        <div className="bg-gray-900 rounded-2xl p-6 flex flex-col gap-4">
          <h2 className="text-white font-semibold text-lg">Meu perfil</h2>
          <div>
            <label className="text-gray-400 text-sm block mb-1">Nome</label>
            <input
              value={nome}
              onChange={e => setNome(e.target.value)}
              className="w-full bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          <div>
            <label className="text-gray-400 text-sm block mb-1">CPF</label>
            <input
              value={cpf}
              onChange={e => setCpf(e.target.value)}
              placeholder="000.000.000-00"
              className="w-full bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          <div>
            <label className="text-gray-400 text-sm block mb-1">E-mail</label>
            <input
              value={email}
              disabled
              className="w-full bg-gray-800 text-gray-500 rounded-xl px-4 py-3 outline-none cursor-not-allowed"
            />
          </div>
          <button
            onClick={salvarPerfil}
            disabled={salvandoPerfil}
            className="bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition"
          >
            {salvandoPerfil ? 'Salvando...' : 'Salvar alterações'}
          </button>
        </div>
      </div>
    </ClienteLayout>
  )
}
