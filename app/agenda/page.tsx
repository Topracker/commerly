'use client'
import { useState, useEffect } from 'react'
import { diaLoja, formatarData, somarDias } from '../lib/datas'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import { AppLayout } from '../components/AppLayout'
import { Toast } from '../components/Toast'
import { ConfirmModal } from '../components/ConfirmModal'
import {
  carregarAgendamentos, salvarAgendamento, removerAgendamento, carregarServicos,
  lancarAtendimentoNoCaixa,
  type Agendamento, type Servico,
} from '../lib/nicheStore'
import { FORMAS_CAIXA } from '../lib/vale'

const HORAS = Array.from({ length: 28 }, (_, i) => {
  const h = (7 + Math.floor(i / 2)).toString().padStart(2, '0')
  const m = i % 2 === 0 ? '00' : '30'
  return `${h}:${m}`
})

function hoje() {
  return diaLoja() // YYYY-MM-DD no fuso da loja
}

function rotuloData(iso: string) {
  const hojeIso = hoje()
  if (iso === hojeIso) return 'Hoje'
  if (iso === somarDias(hojeIso, 1)) return 'Amanhã'
  return formatarData(iso, { weekday: 'short', day: '2-digit', month: '2-digit' })
}

export default function Agenda() {
  const { loja, loading, sair } = useAuth()
  const { toast, mostrarToast } = useToast()

  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([])
  const [servicos, setServicos] = useState<Servico[]>([])
  const [modal, setModal] = useState(false)
  const [editando, setEditando] = useState<Agendamento | null>(null)
  const [confirmarId, setConfirmarId] = useState<string | null>(null)

  // Concluir atendimento: lança o valor no caixa (agenda → vendas).
  const [concluindo, setConcluindo] = useState<Agendamento | null>(null)
  const [valorConcluir, setValorConcluir] = useState('')
  const [formaConcluir, setFormaConcluir] = useState<string>(FORMAS_CAIXA[0])
  const [salvandoConcluir, setSalvandoConcluir] = useState(false)

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

  function abrirConcluir(ag: Agendamento) {
    const preco = servicos.find(s => s.nome === ag.servico)?.preco
    setConcluindo(ag)
    setValorConcluir(preco && preco > 0 ? preco.toFixed(2).replace('.', ',') : '')
    setFormaConcluir(FORMAS_CAIXA[0])
  }

  // lancar = true: registra a venda e conclui. false: só marca como concluído.
  async function confirmarConcluir(lancar: boolean) {
    if (!concluindo || salvandoConcluir) return
    const valor = parseFloat(valorConcluir.replace(/\./g, '').replace(',', '.'))
    if (lancar && !(valor > 0)) { mostrarToast('Informe o valor do atendimento', 'erro'); return }
    setSalvandoConcluir(true)
    try {
      if (lancar) await lancarAtendimentoNoCaixa(loja.id, concluindo, valor, formaConcluir)
    } catch (e) {
      mostrarToast(e instanceof Error && e.message ? e.message : 'Erro ao lançar no caixa', 'erro')
      setSalvandoConcluir(false)
      return
    }
    try {
      setAgendamentos(await salvarAgendamento(loja.id, { ...concluindo, status: 'concluido' }))
      mostrarToast(lancar ? `R$ ${valor.toFixed(2).replace('.', ',')} lançado no caixa` : 'Atendimento concluído', 'sucesso')
      setConcluindo(null)
    } catch {
      // A venda já entrou; só o status não mudou. Avisa para não lançar de novo.
      mostrarToast(lancar ? 'Venda lançada, mas não deu para marcar como concluído. Atualize a página.' : 'Erro ao atualizar o status', 'erro')
      if (lancar) setConcluindo(null)
    }
    setSalvandoConcluir(false)
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
                        <button onClick={() => abrirConcluir(a)} className="bg-green-900 hover:bg-green-800 text-green-300 px-3 py-1 rounded-lg text-xs transition">Concluir</button>
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

      {concluindo && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-900 rounded-3xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold text-white mb-1">Concluir atendimento</h2>
            <p className="text-gray-400 text-sm mb-5">{concluindo.servico} — {concluindo.cliente}</p>
            <div className="flex flex-col gap-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-gray-400 text-sm">Valor recebido</span>
                <input inputMode="decimal" placeholder="0,00" value={valorConcluir} onChange={e => setValorConcluir(e.target.value)} className="bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500" />
              </label>
              <div className="grid grid-cols-2 gap-2">
                {FORMAS_CAIXA.map(f => (
                  <button key={f} onClick={() => setFormaConcluir(f)}
                    className={`py-2.5 rounded-xl font-semibold transition text-sm ${formaConcluir === f ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
                    {f}
                  </button>
                ))}
              </div>
              <button onClick={() => confirmarConcluir(true)} disabled={salvandoConcluir} className="bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition">
                {salvandoConcluir ? 'Salvando...' : 'Lançar no caixa e concluir'}
              </button>
              <div className="flex gap-3">
                <button onClick={() => setConcluindo(null)} disabled={salvandoConcluir} className="flex-1 bg-gray-800 hover:bg-gray-700 text-white py-3 rounded-xl transition">Cancelar</button>
                <button onClick={() => confirmarConcluir(false)} disabled={salvandoConcluir} className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 py-3 rounded-xl transition text-sm">Só concluir</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
