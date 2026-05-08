'use client'
import { useState, useEffect } from 'react'
import { useCliente } from '../../hooks/useCliente'
import { useToast } from '../../hooks/useToast'
import { Toast } from '../../components/Toast'
import { User, AlertCircle, ShoppingBag, Search, LogOut } from 'lucide-react'
import { useRouter } from 'next/navigation'

type Aba = 'perfil' | 'dividas' | 'historico'

export default function ClienteDashboard() {
  const { cliente, loading, supabase, sair } = useCliente()
  const { toast, mostrarToast } = useToast()
  const router = useRouter()
  const [aba, setAba] = useState<Aba>('perfil')

  const [nome, setNome] = useState('')
  const [cpf, setCpf] = useState('')
  const [email, setEmail] = useState('')
  const [salvandoPerfil, setSalvandoPerfil] = useState(false)

  const [dividas, setDividas] = useState<any[]>([])
  const [historico, setHistorico] = useState<any[]>([])
  const [carregando, setCarregando] = useState(false)

  useEffect(() => {
    if (cliente) {
      setNome(cliente.nome || '')
      setCpf(cliente.cpf || '')
      carregarEmail()
      carregarFiados()
    }
  }, [cliente])

  async function carregarEmail() {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) setEmail(user.email || '')
  }

  async function carregarFiados() {
    if (!cliente?.nome) return
    setCarregando(true)
    const { data, error } = await supabase
      .from('fiado')
      .select('*, lojas(id, nome)')
      .ilike('cliente_nome', cliente.nome)
      .order('created_at', { ascending: false })

    if (!error && data) {
      const lojaMap: Record<string, any> = {}
      data.forEach((f: any) => {
        const lid = f.loja_id
        if (!lojaMap[lid]) {
          lojaMap[lid] = {
            loja_id: lid,
            loja_nome: f.lojas?.nome || 'Loja',
            pendente: 0,
            ultima_entrada: f.created_at,
          }
        }
        if (!f.pago) lojaMap[lid].pendente += f.valor
      })
      setDividas(Object.values(lojaMap).filter((l: any) => l.pendente > 0))
      setHistorico(data)
    }
    setCarregando(false)
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
    <main className="min-h-screen bg-gray-950">
      <Toast toast={toast} />

      <header className="bg-gray-900 border-b border-gray-800 px-4 py-4 flex items-center justify-between">
        <div>
          <p className="text-green-400 text-xs font-semibold uppercase tracking-wide mb-0.5">Cliente</p>
          <p className="text-white font-bold truncate max-w-[180px]">{cliente.nome}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => router.push('/cliente/buscar')}
            className="flex items-center gap-1.5 bg-green-700 hover:bg-green-600 text-white px-3 py-2 rounded-xl text-sm transition"
          >
            <Search size={14} />
            Buscar lojas
          </button>
          <button
            onClick={sair}
            title="Sair"
            className="text-gray-400 hover:text-white p-2 rounded-xl hover:bg-gray-800 transition"
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>

      <div className="flex border-b border-gray-800 bg-gray-900 px-2">
        {([
          { id: 'perfil', label: 'Perfil', Icon: User },
          { id: 'dividas', label: 'Minhas dívidas', Icon: AlertCircle },
          { id: 'historico', label: 'Histórico', Icon: ShoppingBag },
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

        {aba === 'dividas' && (
          carregando ? (
            <div className="text-center py-12 text-gray-500">Carregando...</div>
          ) : dividas.length === 0 ? (
            <div className="bg-gray-900 rounded-2xl p-10 text-center">
              <AlertCircle size={32} className="mx-auto mb-3 text-gray-600" />
              <p className="text-gray-500">Nenhuma dívida pendente.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-gray-400 text-sm">{dividas.length} loja{dividas.length !== 1 ? 's' : ''} com fiado pendente</p>
              {dividas.map((d: any) => (
                <div key={d.loja_id} className="bg-gray-900 rounded-2xl p-5">
                  <p className="text-white font-semibold">{d.loja_nome}</p>
                  <p className="text-red-400 text-2xl font-bold mt-1">
                    R$ {d.pendente.toFixed(2)}
                  </p>
                  <p className="text-gray-500 text-xs mt-2">
                    Última entrada: {new Date(d.ultima_entrada).toLocaleDateString('pt-BR')}
                  </p>
                </div>
              ))}
            </div>
          )
        )}

        {aba === 'historico' && (
          carregando ? (
            <div className="text-center py-12 text-gray-500">Carregando...</div>
          ) : historico.length === 0 ? (
            <div className="bg-gray-900 rounded-2xl p-10 text-center">
              <ShoppingBag size={32} className="mx-auto mb-3 text-gray-600" />
              <p className="text-gray-500">Nenhuma compra registrada ainda.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-gray-400 text-sm">{historico.length} registro{historico.length !== 1 ? 's' : ''}</p>
              {historico.map((f: any) => (
                <div key={f.id} className={`bg-gray-900 rounded-2xl p-4 ${f.pago ? 'opacity-70' : ''}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-green-400 text-xs font-semibold">{f.lojas?.nome || 'Loja'}</p>
                      <p className="text-white font-semibold mt-0.5">{f.descricao}</p>
                      <p className="text-gray-500 text-xs mt-1">
                        {new Date(f.created_at).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`font-bold ${f.pago ? 'text-gray-400' : 'text-red-400'}`}>
                        R$ {f.valor.toFixed(2)}
                      </p>
                      <span className={`text-xs px-2 py-0.5 rounded-full mt-1 inline-block ${
                        f.pago ? 'bg-green-900 text-green-300' : 'bg-red-900/50 text-red-400'
                      }`}>
                        {f.pago ? 'Pago' : 'Pendente'}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        )}

      </div>
    </main>
  )
}
