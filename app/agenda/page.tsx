'use client'
import { useState, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import { AppLayout } from '../components/AppLayout'
import { Toast } from '../components/Toast'
import { ConfirmModal } from '../components/ConfirmModal'
import {
  carregarAgendamentos, salvarAgendamento, removerAgendamento, carregarServicos,
  type Agendamento, type Servico, type StatusAgendamento,
} from '../lib/nicheStore'

const HORAS = Array.from({ length: 28 }, (_, i) => {
  const h = (7 + Math.floor(i / 2)).toString().padStart(2, '0')
  const m = i % 2 === 0 ? '00' : '30'
  return `${h}:${m}`
})

function hoje() {
  return new Date().toLocaleDateString('sv-SE') // YYYY-MM-DD local
}

function rotuloData(iso: string) {
  const d = new Date(iso + 'T12:00:00')
  const hojeIso = hoje()
  if (iso === hojeIso) return 'Hoje'
  const amanha = new Date()
  amanha.setDate(amanha.getDate() + 1)
  if (iso === amanha.toLocaleDateString('sv-SE')) return 'Amanhã'
  return d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })
}

export default function Agenda() {
  const { loja, loading, sair } = useAuth()
  const { toast, mostrarToast } = useToast()

  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([])
  const [servicos, setServicos] = useState<Servico[]>([])
  const [modal, setModal] = useState(false)
  const [editando, setEditando] = useState<Agendamento | null>(null)
  const [confirmarId, setConfirmarId] = useState<string | null>(null)

  const [cliente, setCliente] = useState('')
  const [servico, setServico] = useState('')
  const [data, setData] = useState(hoje())
  const [hora, setHora] = useState('09:00')
  const [telefone, setTelefone] = useState('')
  const [obs, setObs] = useState('')

  useEffect(() => {
    if (!loja) return
    let ativo = true
    Promise.all([carregarAgendamentos(loja.id), carregarServicos(loja.id)])
      .then(([ags, servs]) => { if (!ativo) return; setAgendamentos(ags); setServicos(servs) })
      .catch(() => { if (ativo) mostrarToast('Erro ao carregar a agenda', 'erro') })
    return () => { ativo = false }
  }, [loja])

  function abrirModal(ag?: Agendamento) {
    if (ag) {
      setEditando(ag)
      setCliente(ag.cliente); setServico(ag.servico); setData(ag.data)
      setHora(ag.hora); setTelefone(ag.telefone || ''); setObs(ag.obs || '')
    } else {
      setEditando(null)
      setCliente(''); setServico(''); setData(hoje()); setHora('09:00'); setTelefone(''); setObs('')
    }
    setModal(true)
  }

  async function salvar() {
    if (!cliente.trim() || !servico.trim()) {
      mostrarToast('Informe o cliente e o serviço!', 'erro'); return
    }
    try {
      const lista = await salvarAgendamento(loja.id, {
        id: editando?.id,
        cliente: cliente.trim(),
        servico: servico.trim(),
        data, hora,
        telefone: telefone.trim() || null,
        obs: obs.trim() || null,
        status: editando?.status || 'agendado',
      })
      setAgendamentos(lista)
      setModal(false)
      mostrarToast(editando ? 'Agendamento atualizado!' : 'Horário marcado!', 'sucesso')
    } catch {
      mostrarToast('Erro ao salvar o agendamento', 'erro')
    }
  }

  async function mudarStatus(ag: Agendamento, status: StatusAgendamento) {
    try {
      setAgendamentos(await salvarAgendamento(loja.id, { ...ag, status }))
    } catch {
      mostrarToast('Erro ao atualizar o status', 'erro')
    }
  }

  async function remover() {
    if (!confirmarId) return
    try {
      const lista = await removerAgendamento(loja.id, confirmarId)
      setAgendamentos(lista)
      setConfirmarId(null)
      mostrarToast('Agendamento removido', 'sucesso')
    } catch {
      mostrarToast('Erro ao remover o agendamento', 'erro')
    }
  }

  if (loading) return (
    <main className="min-h-screen bg-gray-950 flex items-center justify-center">
      <p className="text-gray-400">Carregando...</p>
    </main>
  )
  if (!loja) return null

  // Mostra só futuros/hoje por padrão; oculta cancelados antigos.
  const visiveis = agendamentos.filter(a => a.data >= hoje() || a.status === 'agendado')
  const grupos: Record<string, Agendamento[]> = {}
  for (const a of visiveis) (grupos[a.data] ||= []).push(a)
  const dias = Object.keys(grupos).sort()

  return (
    <AppLayout loja={loja} sair={sair} titulo="Agenda">
      <Toast toast={toast} />
      <ConfirmModal
        aberto={!!confirmarId}
        titulo="Remover agendamento"
        mensagem="Tem certeza que deseja remover este horário?"
        textoBotao="Remover"
        onConfirm={remover}
        onCancel={() => setConfirmarId(null)}
      />

      <div className="flex items-center justify-between mb-6">
        <p className="text-gray-400 text-sm">{visiveis.length} horário(s) marcado(s)</p>
        <button onClick={() => abrirModal()} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl transition">
          + Marcar horário
        </button>
      </div>

      {dias.length === 0 ? (
        <div className="text-center text-gray-500 py-20">
          <p className="text-4xl mb-3">📅</p>
          Nenhum horário marcado ainda. Toque em “Marcar horário”.
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {dias.map(dia => (
            <div key={dia}>
              <p className="text-gray-400 text-xs uppercase font-semibold mb-2 capitalize">{rotuloData(dia)}</p>
              <div className="flex flex-col gap-2">
                {grupos[dia].sort((a, b) => a.hora.localeCompare(b.hora)).map(a => (
                  <div key={a.id} className={`bg-gray-900 rounded-2xl p-4 flex items-center gap-4 ${a.status !== 'agendado' ? 'opacity-60' : ''}`}>
                    <div className="text-center shrink-0 w-14">
                      <p className="text-white font-bold">{a.hora}</p>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-white font-semibold truncate">{a.cliente}</p>
                        {a.status === 'concluido' && <span className="text-xs bg-green-900 text-green-300 px-2 py-0.5 rounded-full">Concluído</span>}
                        {a.status === 'cancelado' && <span className="text-xs bg-red-900 text-red-300 px-2 py-0.5 rounded-full">Cancelado</span>}
                      </div>
                      <p className="text-gray-400 text-sm truncate">{a.servico}</p>
                      {a.telefone && <p className="text-gray-500 text-xs">{a.telefone}</p>}
                    </div>
                    <div className="flex flex-col gap-1.5 shrink-0">
                      {a.status === 'agendado' && (
                        <button onClick={() => mudarStatus(a, 'concluido')} className="bg-green-900 hover:bg-green-800 text-green-300 px-3 py-1 rounded-lg text-xs transition">Concluir</button>
                      )}
                      <button onClick={() => abrirModal(a)} className="bg-gray-800 hover:bg-gray-700 text-white px-3 py-1 rounded-lg text-xs transition">Editar</button>
                      <button onClick={() => setConfirmarId(a.id)} className="bg-red-900 hover:bg-red-800 text-red-300 px-3 py-1 rounded-lg text-xs transition">Remover</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-900 rounded-3xl p-6 w-full max-w-md max-h-screen overflow-y-auto">
            <h2 className="text-xl font-bold text-white mb-6">{editando ? 'Editar agendamento' : 'Novo horário'}</h2>
            <div className="flex flex-col gap-4">
              <input placeholder="Nome do cliente *" value={cliente} onChange={e => setCliente(e.target.value)} className="bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500" />

              {servicos.length > 0 ? (
                <select value={servico} onChange={e => setServico(e.target.value)} className="bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">Selecione o serviço *</option>
                  {servicos.map(s => <option key={s.id} value={s.nome}>{s.nome} — R$ {s.preco.toFixed(2)}</option>)}
                  <option value="__outro__">Outro / digitar</option>
                </select>
              ) : null}
              {(servicos.length === 0 || servico === '__outro__') && (
                <input placeholder="Serviço *" value={servico === '__outro__' ? '' : servico} onChange={e => setServico(e.target.value)} className="bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500" />
              )}

              <div className="flex gap-3">
                <input type="date" value={data} onChange={e => setData(e.target.value)} className="flex-1 bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500" />
                <select value={hora} onChange={e => setHora(e.target.value)} className="bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500">
                  {HORAS.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>

              <input placeholder="Telefone (opcional)" value={telefone} onChange={e => setTelefone(e.target.value)} className="bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500" />
              <input placeholder="Observação (opcional)" value={obs} onChange={e => setObs(e.target.value)} className="bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500" />

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
