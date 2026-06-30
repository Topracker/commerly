'use client'
import { useState, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import { AppLayout } from '../components/AppLayout'
import { Toast } from '../components/Toast'

function ModalTokenPagBank({ onClose }: { onClose: () => void }) {
  const [aba, setAba] = useState<'pc' | 'celular'>('pc')

  const passosPc = [
    { emoji: '🌐', texto: 'Acesse o site do PagBank em pagseguro.uol.com.br e faça login na sua conta.' },
    { emoji: '👤', texto: 'Clique no seu nome ou foto de perfil no canto superior direito.' },
    { emoji: '⚙️', texto: 'Selecione "Minha Conta" no menu suspenso.' },
    { emoji: '🔑', texto: 'No menu lateral, clique em "Preferências" e depois em "Integrações".' },
    { emoji: '📋', texto: 'Na seção "Token de segurança", clique em "Gerar Token".' },
    { emoji: '✅', texto: 'Confirme a ação e copie o token gerado. Cole aqui no campo acima.' },
  ]

  const passosCelular = [
    { emoji: '📱', texto: 'Abra o aplicativo do PagBank no seu celular e faça login.' },
    { emoji: '☰', texto: 'Toque no ícone de menu (três linhas) no canto superior esquerdo.' },
    { emoji: '👤', texto: 'Toque em "Meu Perfil" ou no seu nome no topo do menu.' },
    { emoji: '⚙️', texto: 'Role para baixo e toque em "Configurações da Conta".' },
    { emoji: '🔑', texto: 'Toque em "Integrações" e depois em "Token de segurança".' },
    { emoji: '✅', texto: 'Toque em "Gerar Token", confirme e copie o código. Cole aqui no campo acima.' },
  ]

  const passos = aba === 'pc' ? passosPc : passosCelular

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" onClick={onClose}>
      <div className="bg-gray-900 rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-gray-800">
          <h3 className="text-white font-semibold text-lg">Como gerar o token do PagBank</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">×</button>
        </div>

        <div className="flex gap-2 p-4 pb-0">
          <button
            onClick={() => setAba('pc')}
            className={`flex-1 py-2 rounded-xl text-sm font-semibold transition ${aba === 'pc' ? 'bg-green-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
          >
            💻 PC
          </button>
          <button
            onClick={() => setAba('celular')}
            className={`flex-1 py-2 rounded-xl text-sm font-semibold transition ${aba === 'celular' ? 'bg-green-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
          >
            📱 Celular
          </button>
        </div>

        <div className="p-4 flex flex-col gap-3">
          {passos.map((passo, i) => (
            <div key={i} className="flex gap-3 bg-gray-800 rounded-xl p-3">
              <div className="flex-shrink-0 w-7 h-7 rounded-full bg-green-700 flex items-center justify-center text-xs font-bold text-white">{i + 1}</div>
              <div className="flex gap-2">
                <span className="text-lg leading-snug">{passo.emoji}</span>
                <p className="text-gray-300 text-sm leading-snug">{passo.texto}</p>
              </div>
            </div>
          ))}

          <div className="bg-yellow-950 border border-yellow-800 rounded-xl p-3 mt-1">
            <p className="text-yellow-300 text-xs">⚠️ O token é gerado uma única vez. Salve-o em local seguro antes de colar aqui.</p>
          </div>
        </div>
      </div>
    </div>
  )
}

function ModalWebhookPagBank({ url, onClose }: { url: string; onClose: () => void }) {
  const [aba, setAba] = useState<'pc' | 'celular'>('pc')
  const [copiado, setCopiado] = useState(false)

  async function copiar() {
    try {
      await navigator.clipboard.writeText(url)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      /* navegador sem suporte a clipboard — usuário copia manualmente */
    }
  }

  const passosPc = [
    { emoji: '🌐', texto: 'Acesse pagseguro.uol.com.br e faça login na sua conta.' },
    { emoji: '👤', texto: 'Clique no seu nome ou foto de perfil no canto superior direito e abra "Minha Conta".' },
    { emoji: '⚙️', texto: 'No menu lateral, clique em "Preferências" e depois em "Notificações" (ou "Integrações").' },
    { emoji: '📋', texto: 'No campo de URL de notificação / webhook, cole a URL copiada acima.' },
    { emoji: '✅', texto: 'Salve. Pronto — as vendas aprovadas no PagBank passam a entrar sozinhas no painel.' },
  ]

  const passosCelular = [
    { emoji: '📱', texto: 'Abra o aplicativo do PagBank no seu celular e faça login.' },
    { emoji: '☰', texto: 'Toque no ícone de menu e abra "Meu Perfil" ou "Configurações da Conta".' },
    { emoji: '🔔', texto: 'Toque em "Notificações" ou "Integrações".' },
    { emoji: '📋', texto: 'No campo de URL de notificação / webhook, cole a URL copiada acima.' },
    { emoji: '✅', texto: 'Salve. Pronto — as vendas aprovadas no PagBank passam a entrar sozinhas no painel.' },
  ]

  const passos = aba === 'pc' ? passosPc : passosCelular

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" onClick={onClose}>
      <div className="bg-gray-900 rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-gray-800">
          <h3 className="text-white font-semibold text-lg">Como configurar o webhook</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">×</button>
        </div>

        <div className="p-4 pb-0">
          <p className="text-gray-400 text-xs mb-2">Sua URL de webhook:</p>
          <div className="flex items-center gap-2 bg-gray-800 rounded-xl p-2">
            <span className="text-gray-300 font-mono text-xs break-all flex-1 px-1">{url}</span>
            <button
              onClick={copiar}
              className={`flex-shrink-0 px-3 py-2 rounded-lg text-xs font-semibold transition ${copiado ? 'bg-green-700 text-white' : 'bg-green-600 hover:bg-green-500 text-white'}`}
            >
              {copiado ? '✓ Copiado' : 'Copiar'}
            </button>
          </div>
        </div>

        <div className="flex gap-2 p-4 pb-0">
          <button
            onClick={() => setAba('pc')}
            className={`flex-1 py-2 rounded-xl text-sm font-semibold transition ${aba === 'pc' ? 'bg-green-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
          >
            💻 PC
          </button>
          <button
            onClick={() => setAba('celular')}
            className={`flex-1 py-2 rounded-xl text-sm font-semibold transition ${aba === 'celular' ? 'bg-green-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
          >
            📱 Celular
          </button>
        </div>

        <div className="p-4 flex flex-col gap-3">
          {passos.map((passo, i) => (
            <div key={i} className="flex gap-3 bg-gray-800 rounded-xl p-3">
              <div className="flex-shrink-0 w-7 h-7 rounded-full bg-green-700 flex items-center justify-center text-xs font-bold text-white">{i + 1}</div>
              <div className="flex gap-2">
                <span className="text-lg leading-snug">{passo.emoji}</span>
                <p className="text-gray-300 text-sm leading-snug">{passo.texto}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function Integracoes() {
  const { loja, loading, supabase, sair } = useAuth()
  const { toast, mostrarToast } = useToast()

  const [mpConectado, setMpConectado] = useState(false)
  const [mpUserId, setMpUserId] = useState<string | null>(null)
  const [desconectando, setDesconectando] = useState(false)
  const [sincronizando, setSincronizando] = useState(false)

  const [pbConectado, setPbConectado] = useState(false)
  const [pbEmail, setPbEmail] = useState('')
  const [pbAmbiente, setPbAmbiente] = useState<'producao' | 'sandbox'>('producao')
  const [pbEmailInput, setPbEmailInput] = useState('')
  const [pbTokenInput, setPbTokenInput] = useState('')
  const [pbAmbienteInput, setPbAmbienteInput] = useState<'producao' | 'sandbox'>('producao')
  const [pbSalvando, setPbSalvando] = useState(false)
  const [pbDesconectando, setPbDesconectando] = useState(false)
  const [modalTokenAberto, setModalTokenAberto] = useState(false)
  const [modalWebhookAberto, setModalWebhookAberto] = useState(false)
  const [webhookCopiado, setWebhookCopiado] = useState(false)

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

  async function sincronizarMP() {
    setSincronizando(true)
    try {
      const res = await fetch('/api/mercadopago/sincronizar', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { mostrarToast(data.erro || 'Erro ao sincronizar pagamentos.', 'erro'); return }
      if (data.novas > 0) mostrarToast(`${data.novas} venda(s) sincronizada(s) do Mercado Pago!`, 'sucesso')
      else mostrarToast('Nenhuma venda nova encontrada.', 'sucesso')
    } catch {
      mostrarToast('Erro de rede ao sincronizar. Tente novamente.', 'erro')
    }
    setSincronizando(false)
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

  function webhookUrlPB() {
    return typeof window !== 'undefined' ? `${window.location.origin}/api/pagbank/webhook/${loja.id}` : ''
  }

  async function copiarWebhookPB() {
    try {
      await navigator.clipboard.writeText(webhookUrlPB())
      setWebhookCopiado(true)
      mostrarToast('URL do webhook copiada!', 'sucesso')
      setTimeout(() => setWebhookCopiado(false), 2000)
    } catch {
      mostrarToast('Não foi possível copiar. Copie a URL manualmente.', 'erro')
    }
  }

  async function desconectarPB() {
    setPbDesconectando(true)
    const res = await fetch('/api/pagbank/disconnect', { method: 'POST' })
    if (res.ok) { setPbConectado(false); setPbEmail(''); mostrarToast('PagBank desconectado.', 'sucesso') }
    else mostrarToast('Erro ao desconectar. Tente novamente.', 'erro')
    setPbDesconectando(false)
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
      {modalTokenAberto && <ModalTokenPagBank onClose={() => setModalTokenAberto(false)} />}
      {modalWebhookAberto && <ModalWebhookPagBank url={webhookUrlPB()} onClose={() => setModalWebhookAberto(false)} />}

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
            <p className="text-gray-400 text-xs">Pagamentos feitos na maquininha serão registrados automaticamente nas suas vendas. Se alguma venda não aparecer, use o botão abaixo para buscar os pagamentos recentes direto no Mercado Pago.</p>
            <button onClick={sincronizarMP} disabled={sincronizando} className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition text-sm">
              {sincronizando ? 'Sincronizando...' : 'Sincronizar pagamentos'}
            </button>
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
            <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-3">
              <p className="text-gray-300 text-sm font-medium mb-1">✅ Pagamentos registrados automaticamente</p>
              <p className="text-gray-400 text-xs">
                Suas vendas no PagBank entram sozinhas no painel assim que o pagamento é aprovado, via webhook — não é preciso sincronizar manualmente. Falta só uma etapa: configurar esta URL nas notificações da sua conta PagBank.
              </p>
              <div className="flex items-center gap-2 bg-gray-900 rounded-lg p-2 mt-2">
                <span className="text-gray-300 font-mono text-xs break-all flex-1 px-1">
                  {typeof window !== 'undefined' ? window.location.origin : ''}/api/pagbank/webhook/{loja.id}
                </span>
                <button
                  onClick={copiarWebhookPB}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${webhookCopiado ? 'bg-green-700 text-white' : 'bg-green-600 hover:bg-green-500 text-white'}`}
                >
                  {webhookCopiado ? '✓ Copiado' : 'Copiar'}
                </button>
              </div>
              <button onClick={() => setModalWebhookAberto(true)} className="text-green-400 hover:text-green-300 text-xs underline mt-2">
                Como configurar o webhook no PagBank?
              </button>
            </div>
            <button onClick={desconectarPB} disabled={pbDesconectando} className="bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-gray-300 font-semibold py-3 rounded-xl transition text-sm">
              {pbDesconectando ? 'Desconectando...' : 'Desconectar PagBank'}
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-gray-400 text-sm">Informe as credenciais da sua conta PagBank para registrar pagamentos automaticamente.</p>
            <input placeholder="E-mail da conta PagBank" type="email" value={pbEmailInput} onChange={e => setPbEmailInput(e.target.value)} className={inputClass} />
            <input placeholder="Token Bearer do PagBank" type="password" value={pbTokenInput} onChange={e => setPbTokenInput(e.target.value)} className={inputClass} />
            <div className="flex items-center justify-between">
              <p className="text-gray-500 text-xs">Encontre o token em: PagBank → Sua conta → Perfil → Credenciais</p>
              <button onClick={() => setModalTokenAberto(true)} className="text-green-400 hover:text-green-300 text-xs underline whitespace-nowrap ml-3">Como pegar o token?</button>
            </div>
            <button onClick={conectarPB} disabled={pbSalvando} className="bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition">
              {pbSalvando ? 'Conectando...' : 'Conectar PagBank'}
            </button>
          </div>
        )}
      </div>
    </AppLayout>
  )
}
