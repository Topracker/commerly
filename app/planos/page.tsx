'use client'
import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '../supabase'
import { CheckCircle, Clock, Zap, AlertTriangle, X } from 'lucide-react'

const PRECO_PROMO = 'R$ 29,90'
const PRECO_NORMAL = 'R$ 54,99'
const CICLOS_PROMO = 2

function PlanosConteudo() {
  const router = useRouter()
  const params = useSearchParams()
  const supabase = createClient()

  const [loja, setLoja] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [vagasRestantes, setVagasRestantes] = useState<number | null>(null)
  const [assinando, setAssinando] = useState(false)
  const [cancelando, setCancelando] = useState(false)
  const [confirmarCancelamento, setConfirmarCancelamento] = useState(false)
  const [erro, setErro] = useState('')

  const status = params.get('status')

  useEffect(() => {
    Promise.all([
      supabase.auth.getUser().then(async ({ data: { user } }) => {
        if (!user) return null
        const { data } = await supabase
          .from('lojas')
          .select('id, nome, plano, trial_expira_em, fundador, mp_assinatura_id, assinatura_ciclos')
          .eq('user_id', user.id)
          .maybeSingle()
        return data
      }),
      fetch('/api/planos/vagas').then(r => r.json()).catch(() => ({ vagasRestantes: null })),
    ]).then(([lojaData, vagasData]) => {
      setLoja(lojaData)
      setVagasRestantes(vagasData?.vagasRestantes ?? null)
      setLoading(false)
    })
  }, [])

  function diasRestantes(): number | null {
    if (!loja?.trial_expira_em) return null
    const diff = new Date(loja.trial_expira_em).getTime() - Date.now()
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)))
  }

  async function cancelarAssinatura() {
    setCancelando(true)
    setErro('')
    try {
      const res = await fetch('/api/mercadopago/cancelar-assinatura', { method: 'POST' })
      const json = await res.json()
      if (!res.ok) { setErro(json.error || 'Erro ao cancelar'); setCancelando(false); return }
      setLoja((l: any) => ({ ...l, plano: 'inativo', mp_assinatura_id: null, assinatura_ciclos: 0 }))
      setConfirmarCancelamento(false)
    } catch {
      setErro('Erro de conexão. Tente novamente.')
    }
    setCancelando(false)
  }

  const dias = diasRestantes()
  const temAssinatura = !!loja?.mp_assinatura_id
  const planoAtivo = loja?.plano === 'ativo'
  const trialValido = loja?.plano === 'trial' && dias !== null && dias > 0
  const ehFundador = !!loja?.fundador
  const ciclos = loja?.assinatura_ciclos ?? 0
  const aindaNaPromo = ehFundador && ciclos < CICLOS_PROMO
  const precoAtual = ehFundador && !temAssinatura ? PRECO_PROMO : PRECO_NORMAL
  const temVagasPromo = vagasRestantes !== null && vagasRestantes > 0

  const FEATURES = [
    'Dashboard completo com gráficos',
    'Controle de vendas, estoque e produtos',
    'Integração MercadoPago e PagBank automática',
    'Fiado, gastos e histórico',
    'Assistente IA',
    'Novas funcionalidades em primeira mão',
  ]

  return (
    <main className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md flex flex-col gap-4">

        <div className="text-center mb-1">
          <h1 className="text-3xl font-bold text-white mb-1">Planos Commerly</h1>
          <p className="text-gray-400 text-sm">Gerencie sua loja com tudo que precisa</p>
        </div>

        {/* Feedbacks de pagamento */}
        {status === 'sucesso' && (
          <div className="bg-green-950 border border-green-800 rounded-2xl p-4 flex items-center gap-3">
            <CheckCircle size={20} className="text-green-400 shrink-0" />
            <p className="text-green-300 text-sm font-semibold">Assinatura confirmada! Seu plano está ativo.</p>
          </div>
        )}
        {status === 'erro' && (
          <div className="bg-red-950 border border-red-800 rounded-2xl p-4">
            <p className="text-red-300 text-sm font-semibold">Houve um problema com o pagamento. Tente novamente.</p>
          </div>
        )}
        {status === 'pendente' && (
          <div className="bg-yellow-950 border border-yellow-800 rounded-2xl p-4 flex items-center gap-3">
            <Clock size={20} className="text-yellow-400 shrink-0" />
            <p className="text-yellow-300 text-sm font-semibold">Assinatura pendente. Você será notificado assim que confirmada.</p>
          </div>
        )}

        {/* Status atual */}
        {!loading && loja && (
          <div className={`rounded-2xl p-4 border ${planoAtivo ? 'bg-green-950 border-green-800' : trialValido ? 'bg-blue-950 border-blue-800' : 'bg-red-950 border-red-800'}`}>
            <p className={`text-sm font-semibold ${planoAtivo ? 'text-green-300' : trialValido ? 'text-blue-300' : 'text-red-300'}`}>
              {planoAtivo && temAssinatura
                ? aindaNaPromo
                  ? `✓ Plano ativo — preço promocional (${CICLOS_PROMO - ciclos} mês${CICLOS_PROMO - ciclos !== 1 ? 'es' : ''} restante${CICLOS_PROMO - ciclos !== 1 ? 's' : ''})`
                  : '✓ Plano ativo'
                : planoAtivo
                ? '✓ Plano ativo'
                : trialValido
                ? `⏳ Trial — ${dias} dia${dias !== 1 ? 's' : ''} restante${dias !== 1 ? 's' : ''}`
                : '⚠️ Seu acesso expirou'}
            </p>
            <p className="text-gray-500 text-xs mt-1">{loja.nome}</p>
          </div>
        )}

        {/* Banner de vagas promocionais */}
        {!loading && temVagasPromo && !temAssinatura && (
          <div className="bg-gradient-to-r from-yellow-950 to-orange-950 border border-yellow-700 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-yellow-400 text-lg">🔥</span>
              <p className="text-yellow-300 font-bold text-sm">Oferta dos Primeiros 100</p>
              <span className="ml-auto bg-yellow-500 text-black text-xs font-bold px-2 py-0.5 rounded-full">46% OFF</span>
            </div>
            <p className="text-yellow-200 text-sm">
              <span className="font-bold">{vagasRestantes} vaga{vagasRestantes !== 1 ? 's' : ''}</span> restante{vagasRestantes !== 1 ? 's' : ''} com desconto —{' '}
              <span className="line-through text-yellow-600">{PRECO_NORMAL}</span>{' '}
              <span className="text-yellow-300 font-bold">{PRECO_PROMO}/mês</span> nos 2 primeiros meses.
            </p>
          </div>
        )}

        {/* Card do Plano */}
        <div className="bg-gray-900 rounded-2xl p-5 border-2 border-blue-600 relative">
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-xs font-bold px-3 py-1 rounded-full whitespace-nowrap">
            PLANO MENSAL
          </div>

          {/* Preço */}
          <div className="flex items-start justify-between mb-4 mt-1">
            <div className="flex items-center gap-2">
              <Zap size={18} className="text-blue-400" />
              <h2 className="text-white font-bold">Acesso completo</h2>
            </div>
            <div className="text-right">
              {!loading && ehFundador && !temAssinatura ? (
                <>
                  <div className="flex items-center gap-2 justify-end">
                    <span className="text-gray-500 text-sm line-through">{PRECO_NORMAL}</span>
                    <span className="bg-green-600 text-white text-xs font-bold px-1.5 py-0.5 rounded">-46%</span>
                  </div>
                  <p className="text-2xl font-bold text-white">{PRECO_PROMO}</p>
                  <p className="text-gray-400 text-xs">por 2 meses, depois {PRECO_NORMAL}/mês</p>
                </>
              ) : (
                <>
                  <p className="text-2xl font-bold text-white">{PRECO_NORMAL}</p>
                  <p className="text-gray-400 text-xs">/mês</p>
                </>
              )}
            </div>
          </div>

          {/* Features */}
          <ul className="flex flex-col gap-2 mb-5">
            {FEATURES.map(f => (
              <li key={f} className="flex items-center gap-2 text-gray-300 text-sm">
                <CheckCircle size={14} className="text-blue-400 shrink-0" />
                {f}
              </li>
            ))}
          </ul>

          {/* CTA */}
          {!loading && (
            temAssinatura ? (
              <div className="w-full bg-green-900 text-green-300 font-semibold py-3 rounded-xl text-center text-sm">
                ✓ Assinatura ativa — cobrança automática mensal
              </div>
            ) : (
              <button
                onClick={() => { setAssinando(true); window.location.href = '/api/mercadopago/assinar' }}
                disabled={assinando}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-bold py-3 rounded-xl transition text-sm"
              >
                {assinando
                  ? 'Redirecionando...'
                  : ehFundador && temVagasPromo
                  ? `Assinar por ${PRECO_PROMO}/mês via Mercado Pago`
                  : `Assinar por ${PRECO_NORMAL}/mês via Mercado Pago`}
              </button>
            )
          )}
        </div>

        {/* Cancelar assinatura */}
        {!loading && temAssinatura && !confirmarCancelamento && (
          <button
            onClick={() => setConfirmarCancelamento(true)}
            className="text-gray-600 text-xs hover:text-red-400 transition text-center"
          >
            Cancelar assinatura
          </button>
        )}

        {/* Modal de confirmação de cancelamento */}
        {confirmarCancelamento && (
          <div className="bg-red-950 border border-red-800 rounded-2xl p-5">
            <div className="flex items-start gap-3 mb-4">
              <AlertTriangle size={18} className="text-red-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-red-300 font-semibold text-sm">Cancelar assinatura?</p>
                <p className="text-red-400 text-xs mt-1">
                  Seu acesso fica ativo até o fim do período pago e é encerrado após isso.
                  {ehFundador && aindaNaPromo && ' Você perde o preço promocional.'}
                </p>
              </div>
              <button onClick={() => setConfirmarCancelamento(false)} className="ml-auto text-gray-600 hover:text-white">
                <X size={16} />
              </button>
            </div>
            {erro && <p className="text-red-300 text-xs mb-3">{erro}</p>}
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmarCancelamento(false)}
                className="flex-1 bg-gray-800 text-gray-300 font-semibold py-2.5 rounded-xl text-sm hover:bg-gray-700 transition"
              >
                Manter
              </button>
              <button
                onClick={cancelarAssinatura}
                disabled={cancelando}
                className="flex-1 bg-red-700 hover:bg-red-600 disabled:opacity-60 text-white font-semibold py-2.5 rounded-xl text-sm transition"
              >
                {cancelando ? 'Cancelando...' : 'Confirmar cancelamento'}
              </button>
            </div>
          </div>
        )}

        {/* Trial info */}
        {!loading && loja && !temAssinatura && (
          <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800">
            <div className="flex items-center gap-2 mb-1">
              <Clock size={14} className="text-gray-500" />
              <p className="text-gray-400 text-xs font-semibold">Trial gratuito incluso</p>
            </div>
            <p className="text-gray-500 text-xs">30 dias de acesso completo sem custo ao criar conta.</p>
          </div>
        )}

        {loja && (
          <button onClick={() => router.push('/dashboard')} className="text-gray-500 text-sm hover:text-gray-400 transition text-center">
            ← Voltar ao dashboard
          </button>
        )}
        {!loja && !loading && (
          <button onClick={() => router.push('/login')} className="text-gray-500 text-sm hover:text-gray-400 transition text-center">
            ← Fazer login
          </button>
        )}
      </div>
    </main>
  )
}

export default function Planos() {
  return (
    <Suspense fallback={
      <main className="min-h-screen bg-gray-950 flex items-center justify-center">
        <p className="text-gray-400">Carregando...</p>
      </main>
    }>
      <PlanosConteudo />
    </Suspense>
  )
}
