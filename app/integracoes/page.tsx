'use client'
import { useState, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import { AppLayout } from '../components/AppLayout'
import { Toast } from '../components/Toast'

// Endereço antigo e estável: leva ao login e, depois, a
// minhaconta.pagbank.com.br/venda-online/integracoes/configuracoes.
const PAGBANK_INTEGRACOES_URL = 'https://pagbank.com.br/preferencias/integracoes.jhtml'

// Integração pronta no código, mas fora do ar até o PagBank liberar a
// Commerly. Enquanto false, o card mostra "em breve" e nada do PagBank roda.
const PAGBANK_LIBERADO = false

function ListaPassos({ passos }: { passos: { emoji: string; texto: string }[] }) {
  return (
    <>
      {passos.map((passo, i) => (
        <div key={i} className="flex gap-3 bg-gray-800 rounded-xl p-3">
          <div className="flex-shrink-0 w-7 h-7 rounded-full bg-green-700 flex items-center justify-center text-xs font-bold text-white">{i + 1}</div>
          <div className="flex gap-2">
            <span className="text-lg leading-snug">{passo.emoji}</span>
            <p className="text-gray-300 text-sm leading-snug">{passo.texto}</p>
          </div>
        </div>
      ))}
    </>
  )
}

function BotaoAbrirPagBank() {
  return (
    <a
      href={PAGBANK_INTEGRACOES_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="block text-center bg-green-600 hover:bg-green-500 text-white font-semibold py-3 rounded-xl transition text-sm"
    >
      Abrir Integrações do PagBank ↗
    </a>
  )
}

function ModalTokenPagBank({ onClose }: { onClose: () => void }) {
  // Passos genéricos de propósito: as telas do PagBank mudam com frequência,
  // então apontamos para a área de Integrações em vez de descrever cada menu.
  const passos = [
    { emoji: '🌐', texto: 'Entre na sua conta PagBank pelo navegador (no computador é mais fácil). O botão abaixo abre a página certa depois do login.' },
    { emoji: '🔑', texto: 'Na área de Integrações (Venda online → Integrações), procure a parte do Token e clique para gerar.' },
    { emoji: '📧', texto: 'O PagBank pode mostrar o token na tela ou mandar para o seu e-mail. Se for por e-mail, procure uma mensagem do PagBank na caixa de entrada — e no spam também.' },
    { emoji: '📋', texto: 'Copie o token inteiro e cole no campo "Token" da Commerly.' },
    { emoji: '✉️', texto: 'No campo "E-mail", use o mesmo e-mail com que você entra no PagBank.' },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" onClick={onClose}>
      <div className="bg-gray-900 rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-gray-800">
          <h3 className="text-white font-semibold text-lg">Como pegar o token do PagBank</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">×</button>
        </div>

        <div className="p-4 flex flex-col gap-3">
          <ListaPassos passos={passos} />
          <BotaoAbrirPagBank />

          <div className="bg-yellow-950 border border-yellow-800 rounded-xl p-3 mt-1 flex flex-col gap-1">
            <p className="text-yellow-300 text-xs">⚠️ Gerar um token novo pode desativar o anterior. Se outro sistema usa o token antigo, ele vai precisar do novo também.</p>
            <p className="text-yellow-300 text-xs">🔒 O token é como uma senha: não mande para ninguém por mensagem.</p>
          </div>
        </div>
      </div>
    </div>
  )
}

function ModalWebhookPagBank({ url, onClose }: { url: string; onClose: () => void }) {
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

  const passos = [
    { emoji: '📋', texto: 'Copie a URL acima no botão "Copiar".' },
    { emoji: '🌐', texto: 'Abra a área de Integrações do PagBank (botão abaixo) e entre na sua conta.' },
    { emoji: '🔔', texto: 'Procure a opção de notificação de transação (Preferências → Integrações → Notificação de transação).' },
    { emoji: '📥', texto: 'Cole a URL no campo de notificação e salve.' },
    { emoji: '✅', texto: 'Pronto! As vendas aprovadas no PagBank, inclusive as da maquininha, passam a entrar sozinhas no painel.' },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" onClick={onClose}>
      <div className="bg-gray-900 rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-gray-800">
          <h3 className="text-white font-semibold text-lg">Como colar a URL no PagBank</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">×</button>
        </div>

        <div className="p-4 pb-0">
          <p className="text-gray-400 text-xs mb-2">Sua URL de notificação:</p>
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

        <div className="p-4 flex flex-col gap-3">
          <ListaPassos passos={passos} />
          <BotaoAbrirPagBank />
          <p className="text-gray-500 text-xs">Se o nome da opção estiver um pouco diferente, procure por &quot;notificação&quot; dentro de Integrações.</p>
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
  const [pbOauthDisponivel, setPbOauthDisponivel] = useState(false)
  const [pbEmailInput, setPbEmailInput] = useState('')
  const [pbTokenInput, setPbTokenInput] = useState('')
  const [pbAmbienteInput, setPbAmbienteInput] = useState<'producao' | 'sandbox'>('producao')
  const [pbSalvando, setPbSalvando] = useState(false)
  const [pbErro, setPbErro] = useState('')
  const [pbDesconectando, setPbDesconectando] = useState(false)
  const [modalTokenAberto, setModalTokenAberto] = useState(false)
  const [modalWebhookAberto, setModalWebhookAberto] = useState(false)
  const [webhookCopiado, setWebhookCopiado] = useState(false)

  const [stripeConectado, setStripeConectado] = useState(false)
  const [stripeOnboarded, setStripeOnboarded] = useState(false)
  const [stripeChecando, setStripeChecando] = useState(true)

  useEffect(() => {
    if (loja) {
      carregarStatusMP()
      if (PAGBANK_LIBERADO) carregarStatusPB()
      carregarStatusStripe()
    }
  }, [loja])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const mp = params.get('mp')
    if (mp === 'conectado') mostrarToast('Mercado Pago conectado com sucesso!', 'sucesso')
    else if (mp === 'erro') mostrarToast('Erro ao conectar Mercado Pago. Tente novamente.', 'erro')
    const st = params.get('stripe')
    if (st === 'ok') mostrarToast('Conta Stripe conectada! Confirmando status...', 'sucesso')
    else if (st === 'erro') mostrarToast('Erro ao conectar a Stripe. Tente novamente.', 'erro')
    else if (st === 'indisponivel') mostrarToast('Pagamento online indisponível no momento.', 'erro')
  }, [])

  async function carregarStatusStripe() {
    setStripeChecando(true)
    try {
      const res = await fetch('/api/loja/stripe-status')
      const d = await res.json().catch(() => ({}))
      setStripeConectado(!!d.conectado)
      setStripeOnboarded(!!d.onboarded)
    } catch {
      /* mantém o estado padrão */
    }
    setStripeChecando(false)
  }

  async function carregarStatusMP() {
    const { data } = await supabase.from('mercadopago_conexoes').select('mp_user_id').eq('loja_id', loja.id).maybeSingle()
    if (data) { setMpConectado(true); setMpUserId(data.mp_user_id) }
  }

  async function carregarStatusPB() {
    const { data } = await supabase.from('pagbank_conexoes').select('email, ambiente, access_token').eq('loja_id', loja.id).maybeSingle()
    if (data) {
      setPbConectado(true)
      // Conexão OAuth não tem e-mail; mostramos o tipo no lugar.
      setPbEmail(data.email || (data.access_token ? 'via Connect' : ''))
      setPbAmbiente(data.ambiente ?? 'producao')
    }
    // Só oferecemos o botão de Connect se a Commerly tiver credenciais de
    // parceiro configuradas (PAGBANK_CLIENT_ID/SECRET).
    const status = await fetch('/api/pagbank/status').then(r => r.json()).catch(() => null)
    if (status) setPbOauthDisponivel(!!status.oauth_disponivel)
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
    if (!pbEmailInput.trim() || !pbTokenInput.trim()) { setPbErro('Preencha o e-mail e o token do PagBank.'); return }
    setPbErro('')
    setPbSalvando(true)
    const res = await fetch('/api/pagbank/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: pbEmailInput, token: pbTokenInput, ambiente: pbAmbienteInput }),
    })
    if (res.ok) {
      setPbConectado(true); setPbEmail(pbEmailInput); setPbAmbiente(pbAmbienteInput)
      setPbEmailInput(''); setPbTokenInput('')
      mostrarToast('PagBank conectado! Falta só o último passo.', 'sucesso')
    } else if (res.status === 429) {
      setPbErro('Muitas tentativas seguidas. Espere um minuto e tente de novo.')
    } else {
      const { error } = await res.json().catch(() => ({ error: '' }))
      setPbErro(error || 'Não foi possível conectar ao PagBank agora. Tente de novo em instantes.')
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
      {!PAGBANK_LIBERADO ? (
        <div className="bg-gray-900 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-full bg-green-600/40 flex items-center justify-center text-white font-bold text-xs">PB</div>
            <h2 className="text-white font-semibold">PagBank</h2>
            <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-800 text-gray-300">em breve</span>
          </div>
          <p className="text-gray-400 text-sm">Estamos finalizando a integração com o PagBank. Por enquanto, conecte o Mercado Pago.</p>
        </div>
      ) : (
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
            <div className="bg-yellow-950/60 border-2 border-yellow-600 rounded-xl p-4">
              <p className="text-yellow-200 text-sm font-semibold mb-1">👉 Último passo: avise o PagBank para mandar suas vendas</p>
              <p className="text-gray-300 text-xs">
                Sem isso, as vendas da maquininha não aparecem aqui. Copie a URL abaixo e cole no PagBank em
                <strong className="text-white"> Preferências → Integrações → Notificação de transação</strong>. Leva 1 minuto e só precisa fazer uma vez.
              </p>
              <div className="flex items-center gap-2 bg-gray-900 rounded-lg p-2 mt-3">
                <span className="text-gray-300 font-mono text-xs break-all flex-1 px-1">{webhookUrlPB()}</span>
                <button
                  onClick={copiarWebhookPB}
                  className={`flex-shrink-0 px-3 py-2 rounded-lg text-xs font-semibold transition ${webhookCopiado ? 'bg-green-700 text-white' : 'bg-green-600 hover:bg-green-500 text-white'}`}
                >
                  {webhookCopiado ? '✓ Copiado' : 'Copiar'}
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-3">
                <a
                  href={PAGBANK_INTEGRACOES_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-green-600 hover:bg-green-500 text-white font-semibold px-4 py-2 rounded-lg transition text-xs"
                >
                  Abrir Integrações do PagBank ↗
                </a>
                <button onClick={() => setModalWebhookAberto(true)} className="text-green-400 hover:text-green-300 text-xs underline">
                  Ver passo a passo
                </button>
              </div>
              <p className="text-gray-500 text-xs mt-3">Depois disso, as vendas aprovadas entram sozinhas no painel — não precisa sincronizar.</p>
            </div>
            <button onClick={desconectarPB} disabled={pbDesconectando} className="bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-gray-300 font-semibold py-3 rounded-xl transition text-sm">
              {pbDesconectando ? 'Desconectando...' : 'Desconectar PagBank'}
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {pbOauthDisponivel && (
              <>
                <a
                  href="/api/pagbank/oauth"
                  className="block text-center bg-green-600 hover:bg-green-500 text-white font-semibold py-3 rounded-xl transition"
                >
                  Conectar com PagBank
                </a>
                <p className="text-gray-500 text-xs text-center">
                  Você autoriza a Commerly na sua conta PagBank — sem colar token.
                </p>
                <div className="flex items-center gap-3 my-1">
                  <span className="h-px bg-gray-800 flex-1" />
                  <span className="text-gray-600 text-xs">ou use um token manual</span>
                  <span className="h-px bg-gray-800 flex-1" />
                </div>
              </>
            )}
            <p className="text-gray-400 text-sm">Conecte sua conta PagBank para as vendas da maquininha entrarem sozinhas no painel. Você só precisa de duas coisas:</p>
            <ol className="text-gray-400 text-xs list-decimal list-inside flex flex-col gap-1 bg-gray-800/60 rounded-xl p-3">
              <li>O <strong className="text-gray-200">e-mail</strong> com que você entra no PagBank.</li>
              <li>O <strong className="text-gray-200">token</strong>, gerado na área de Integrações da sua conta PagBank (pode chegar por e-mail).</li>
            </ol>
            <input placeholder="E-mail da conta PagBank" type="email" autoComplete="email" value={pbEmailInput} onChange={e => { setPbEmailInput(e.target.value); setPbErro('') }} className={inputClass} />
            <input placeholder="Token do PagBank" type="password" autoComplete="off" value={pbTokenInput} onChange={e => { setPbTokenInput(e.target.value); setPbErro('') }} className={inputClass} />
            <button onClick={() => setModalTokenAberto(true)} className="self-start text-green-400 hover:text-green-300 text-xs underline">
              Como pegar o token?
            </button>
            {pbErro && (
              <div className="bg-red-950 border border-red-800 rounded-xl p-3">
                <p className="text-red-300 text-sm">{pbErro}</p>
              </div>
            )}
            <button onClick={conectarPB} disabled={pbSalvando} className="bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition">
              {pbSalvando ? 'Conectando...' : 'Conectar PagBank'}
            </button>
          </div>
        )}
      </div>
      )}

      {/* Stripe — pagamento online dos pedidos de delivery */}
      <div className="bg-gray-900 rounded-2xl p-6 mt-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-lg bg-[#635BFF] flex items-center justify-center text-white font-bold text-xs">S</div>
          <div>
            <h2 className="text-white font-semibold">Stripe — Pagamento online</h2>
            <p className="text-gray-500 text-xs">Receba os pedidos de delivery pagos no cartão pelo app</p>
          </div>
        </div>

        {stripeChecando ? (
          <p className="text-gray-500 text-sm">Verificando status...</p>
        ) : stripeOnboarded ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 bg-green-950 border border-green-800 rounded-xl px-4 py-3">
              <span className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0" />
              <p className="text-green-300 text-sm">Pronto para receber pagamentos online</p>
            </div>
            <p className="text-gray-400 text-xs">
              Quando um cliente paga o pedido no cartão, o valor dos produtos cai na sua conta Stripe automaticamente. A taxa de entrega vai separada para o entregador.
            </p>
            <a href="/api/loja/stripe-connect" className="block text-center bg-gray-800 hover:bg-gray-700 text-gray-300 font-semibold py-3 rounded-xl transition text-sm">
              Gerenciar conta Stripe
            </a>
          </div>
        ) : stripeConectado ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 bg-yellow-950 border border-yellow-800 rounded-xl px-4 py-3">
              <span className="w-2 h-2 rounded-full bg-yellow-400 flex-shrink-0" />
              <p className="text-yellow-300 text-sm">Configuração incompleta</p>
            </div>
            <p className="text-gray-400 text-xs">Falta concluir o cadastro na Stripe para começar a receber. Continue de onde parou:</p>
            <a href="/api/loja/stripe-connect" className="block text-center bg-[#635BFF] hover:bg-[#5147e6] text-white font-semibold py-3 rounded-xl transition">
              Concluir cadastro na Stripe
            </a>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-gray-400 text-sm">Conecte sua conta Stripe para aceitar pagamento no cartão nos pedidos de delivery. Sem isso, os clientes só podem pagar na entrega (dinheiro/Pix).</p>
            <a href="/api/loja/stripe-connect" className="block text-center bg-[#635BFF] hover:bg-[#5147e6] text-white font-semibold py-3 rounded-xl transition">
              Conectar Stripe
            </a>
          </div>
        )}
      </div>
    </AppLayout>
  )
}
