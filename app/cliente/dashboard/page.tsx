'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useCliente } from '../../hooks/useCliente'
import { useToast } from '../../hooks/useToast'
import { Toast } from '../../components/Toast'
import { ClienteLayout } from '../../components/ClienteLayout'
import { getFavoritos, removeFavorito, type LojaFavorita } from '../../lib/favoritos'
import { User, Heart, Store, X } from 'lucide-react'

type Aba = 'perfil' | 'favoritas'

export default function ClienteDashboard() {
  const { cliente, loading, supabase, sair } = useCliente()
  const { toast, mostrarToast } = useToast()
  const router = useRouter()
  const [aba, setAba] = useState<Aba>('perfil')

  const [nome, setNome] = useState('')
  const [cpf, setCpf] = useState('')
  const [email, setEmail] = useState('')
  const [salvandoPerfil, setSalvandoPerfil] = useState(false)

  const [favoritas, setFavoritas] = useState<LojaFavorita[]>([])

  useEffect(() => {
    if (cliente) {
      setNome(cliente.nome || '')
      setCpf(cliente.cpf || '')
      carregarEmail()
    }
  }, [cliente])

  useEffect(() => {
    if (aba === 'favoritas') setFavoritas(getFavoritos())
  }, [aba])

  async function carregarEmail() {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) setEmail(user.email || '')
  }

  function desfavoritar(id: string) {
    removeFavorito(id)
    setFavoritas(getFavoritos())
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
    <ClienteLayout cliente={cliente} sair={sair} noPadding>
      <Toast toast={toast} />

      <div className="flex border-b border-gray-800 bg-gray-900 px-2">
        {([
          { id: 'perfil', label: 'Perfil', Icon: User },
          { id: 'favoritas', label: 'Lojas favoritas', Icon: Heart },
        ] as const).map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setAba(id)}
            className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition whitespace-nowrap ${
              aba === id
                ? 'border-green-500 text-green-400'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      <div className="max-w-2xl mx-auto p-4">

        {aba === 'perfil' && (
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
        )}

        {aba === 'favoritas' && (
          favoritas.length === 0 ? (
            <div className="bg-gray-900 rounded-2xl p-10 text-center">
              <Heart size={32} className="mx-auto mb-3 text-gray-600" />
              <p className="text-gray-500">Nenhuma loja favorita ainda.</p>
              <p className="text-gray-600 text-sm mt-1">Toque no coração de uma loja para salvá-la aqui.</p>
              <button
                onClick={() => router.push('/cliente/buscar')}
                className="mt-4 bg-green-600 hover:bg-green-700 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition"
              >
                Descobrir comércios
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-gray-400 text-sm">{favoritas.length} loja{favoritas.length !== 1 ? 's' : ''} favorita{favoritas.length !== 1 ? 's' : ''}</p>
              {favoritas.map(l => (
                <div key={l.id} className="bg-gray-900 rounded-2xl p-4 flex items-center gap-3">
                  <button
                    onClick={() => router.push(`/cliente/loja/${l.id}`)}
                    className="flex-1 min-w-0 text-left flex items-center gap-3"
                  >
                    <div className="w-10 h-10 bg-green-900 rounded-full flex items-center justify-center shrink-0">
                      <Store size={18} className="text-green-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-white font-semibold truncate">{l.nome}</p>
                      {l.tipo && <p className="text-gray-500 text-xs">{l.tipo}</p>}
                    </div>
                  </button>
                  <button
                    onClick={() => desfavoritar(l.id)}
                    title="Remover dos favoritos"
                    className="text-gray-500 hover:text-red-400 transition shrink-0 p-1"
                  >
                    <X size={18} />
                  </button>
                </div>
              ))}
            </div>
          )
        )}

      </div>
    </ClienteLayout>
  )
}
