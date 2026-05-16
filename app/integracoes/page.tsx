'use client'
import { useState, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import { AppLayout } from '../components/AppLayout'
import { Toast } from '../components/Toast'

export default function Integracoes() {
  const { loja, loading, supabase, sair } = useAuth()
  const { toast, mostrarToast } = useToast()

  const [mpConectado, setMpConectado] = useState(false)
  const [mpUserId, setMpUserId] = useState<string | null>(null)
  const [desconectando, setDesconectando] = useState(false)

  const [pbConectado, setPbConectado] = useState(false)
  const [pbEmail, setPbEmail] = useState('')
  const [pbAmbiente, setPbAmbiente] = useState<'producao' | 'sandbox'>('producao')
  const [pbEmailInput, setPbEmailInput] = useState('')
  const [pbTokenInput, setPbTokenInput] = useState('')
  const [pbAmbienteInput, setPbAmbienteInput] = useState<'producao' | 'sandbox'>('producao')
  const [pbSalvando, setPbSalvando] = useState(false)
  const [pbDesconectando, setPbDesconectando] = useState(false)
  const [pbSincronizando, setPbSincronizando] = useState(false)

  useEffect(() => {
    if (loja) {
      carregarStatusMP()
      carregarStatusPB()
    }
  }, [loja])

  useEffect(() => {
    const mp = new URLSearchParams(window.location.search).get('mp')
    if (mp === 'conectado') mostrarToast('Mercado Pago conectado com sucesso!', 'sucesso')
    else if (mp === 'erro') mostrarToast('Erro ao conectar Mercado Pago. Tente novamente.', 'erro')
  }, [])

  async function carregarStatusMP() {
    const { data } = await supabase.from('mercadopago_conexoes').select('mp_user_id').eq('loja_id', loja.id).maybeSingle()
    if (data) { setMpConectado(true); setMpUserId(data.mp_user_id) }
  }

  async function carregarStatusPB() {
    const { data } = await supabase.from('pagbank_conexoes').select('email, ambiente').eq('loja_id', loja.id).maybeSingle()
    if (data) { setPbConectado(true); setPbEmail(data.email); setPbAmbiente(data.ambiente ?? 'producao') }
  }

  async function desconectarMP() {
    setDesconectando(true)
    const res = await fetch('/api/mercadopago/disconnect', { method: 'POST' })
    if (res.ok) { setMpConectado(false); setMpUserId(null); mostrarToast('Mercado Pago desconectado.', 'sucesso') }
    else mostrarToast('Erro ao desconectar. Tente novamente.', 'erro')
    setDesconectando(false)
  }

  async function conectarPB() {
    if (!pbEmailInput || !pbTokenInput) { mostrarToast('Preencha email e token', 'erro'); return }
    setPbSalvando(true)
    const res = await fetch('/api/pagbank/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: pbEmailInput, token: pbTokenInput, ambiente: pbAmbienteInput }),
    })
    if (res.ok) {
      setPbConectado(true); setPbEmail(pbEmailInput); setPbAmbiente(pbAmbienteInput)
      setPbEmailInput(''); setPbTokenInput('')
      mostrarToast('PagBank conectado com sucesso!', 'sucesso')
    } else {
      const { error } = await res.json().catch(() => ({ error: 'Erro desconhecido' }))
      mostrarToast(error || 'Erro ao conectar PagBank', 'erro')
    }
    setPbSalvando(false)
  }

  async function desconectarPB() {
    setPbDesconectando(true)
    const res = await fetch('/api/pagbank/disconnect', { method: 'POST' })
    if (res.ok) { setPbConectado(false); setPbEmail(''); mostrarToast('PagBank desconectado.', 'sucesso') }
    else mostrarToast('Erro ao desconectar. Tente novamente.', 'erro')
    setPbDesconectando(false)
  }

  async function sincronizarPB() {
    setPbSincronizando(true)
    const res = await fetch('/api/pagbank/sync', { method: 'POST' })
    if (res.ok) {
      const { importadas } = await res.json()
      mostrarToast(`Sincronização concluída: ${importadas} venda(s) importada(s)`, 'sucesso')
    } else mostrarToast('Erro ao sincronizar. Tente novamente.', 'erro')
    setPbSincronizando(false)
  }

  if (loading) return (
    <main className="min-h-screen bg-gray-950 flex items-center justify-center">
      <p className="text-gray-400">Carregando...</p>
    </main>
  )
  if (!loja) return null

  const inputClass = 'bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500'

  return (
    <AppLayout loja={loja} sair={sair} titulo="Integrações" maxWidth="max-w-2xl">
      <Toast toast={toast} />

      {/* Mercado Pago */}
      <div className="bg-gray-900 rounded-2xl p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold text-sm">MP</div>
          <h2 className="text-white font-semibold">Mercado Pago</h2>
        </div>
        {mpConectado ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 bg-green-950 border border-green-800 rounded-xl px-4 py-3">
              <span className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0" />
              <p className="text-green-300 text-sm">Maquininha conectada</p>
              {mpUserId && <p className="text-green-500 text-xs ml-auto">ID: {mpUserId}</p>}
            </div>
            <p className="text-gray-400 text-xs">Pagamentos feitos na maquininha serão registrados automaticamente nas suas vendas.</p>
            <button onClick={desconectarMP} disabled={desconectando} className="bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-gray-300 font-semibold py-3 rounded-xl transition text-sm">
              {desconectando ? 'Desconectando...' : 'Desconectar Mercado Pago'}
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-gray-400 text-sm">Conecte sua conta do Mercado Pago para registrar automaticamente os pagamentos da maquininha nas suas vendas.</p>
            <a href="/api/mercadopago/connect" className="block text-center bg-blue-500 hover:bg-blue-400 text-white font-semibold py-3 rounded-xl transition">
              Conectar Mercado Pago
            </a>
          </div>
        )}
      </div>

      {/* PagBank */}
      <div className="bg-gray-900 rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-full bg-green-600 flex items-center justify-center text-white font-bold text-xs">PB</div>
          <h2 className="text-white font-semibold">PagBank</h2>
        </div>
        {pbConectado ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 bg-green-950 border border-green-800 rounded-xl px-4 py-3">
              <span className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0" />
              <p className="text-green-300 text-sm">Conta conectada</p>
              <div className="ml-auto flex items-center gap-2">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${pbAmbiente === 'sandbox' ? 'bg-yellow-900 text-yellow-300' : 'bg-green-900 text-green-300'}`}>
                  {pbAmbiente === 'sandbox' ? 'Sandbox' : 'Produção'}
                </span>
                <p className="text-green-500 text-xs">{pbEmail}</p>
              </div>
            </div>
            <p className="text-gray-400 text-xs">
              Configure seu webhook no painel do PagBank com a URL:<br />
              <span className="text-gray-300 font-mono break-all">{typeof window !== 'undefined' ? window.location.origin : ''}/api/pagbank/webhook/{loja.id}</span>
            </p>
            <button onClick={sincronizarPB} disabled={pbSincronizando} className="bg-green-800 hover:bg-green-700 disabled:opacity-50 text-green-100 font-semibold py-3 rounded-xl transition text-sm">
              {pbSincronizando ? 'Sincronizando...' : 'Sincronizar últimos 7 dias'}
            </button>
            <button onClick={desconectarPB} disabled={pbDesconectando} className="bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-gray-300 font-semibold py-3 rounded-xl transition text-sm">
              {pbDesconectando ? 'Desconectando...' : 'Desconectar PagBank'}
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-gray-400 text-sm">Informe as credenciais da sua conta PagBank para registrar pagamentos automaticamente.</p>
            <input placeholder="E-mail da conta PagBank" type="email" value={pbEmailInput} onChange={e => setPbEmailInput(e.target.value)} className={inputClass} />
            <input placeholder="Token Bearer do PagBank" type="password" value={pbTokenInput} onChange={e => setPbTokenInput(e.target.value)} className={inputClass} />
            <p className="text-gray-500 text-xs">Encontre o token em: PagBank → Sua conta → Perfil → Credenciais</p>
            <button onClick={conectarPB} disabled={pbSalvando} className="bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition">
              {pbSalvando ? 'Conectando...' : 'Conectar PagBank'}
            </button>
          </div>
        )}
      </div>
    </AppLayout>
  )
}
