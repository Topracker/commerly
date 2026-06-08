'use client'
import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '../supabase'
import { CheckCircle, Zap } from 'lucide-react'

const PRECO_FUNDADOR = 'R$ 29,90'
const PRECO_NORMAL = 'R$ 54,99'

function PlanosConteudo() {
  const router = useRouter()
  const params = useSearchParams()
  const supabase = createClient()

  const [loja, setLoja] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [assinando, setAssinando] = useState(false)
  const [cancelando, setCancelando] = useState(false)
  const [msgCancelamento, setMsgCancelamento] = useState<string | null>(null)
  const [erroCancelamento, setErroCancelamento] = useState<string | null>(null)

  const status = params.get('status')

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { setLoading(false); return }
      const { data } = await supabase
        .from('lojas')
        .select('id, nome, plano, fundador, stripe_subscription_id')
        .eq('user_id', user.id)
        .maybeSingle()
      setLoja(data)
      setLoading(false)
    })
  }, [])

  const temAssinatura = !!loja?.stripe_subscription_id
  const planoAtivo = loja?.plano === 'ativo'
  const ehFundador = !!loja?.fundador
  const precoAtual = ehFundador ? PRECO_FUNDADOR : PRECO_NORMAL

  const FEATURES = [
    'Dashboard completo com gráficos',
    'Controle de vendas, estoque e produtos',
    'Integração MercadoPago automática',
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

        {!loading && loja && (
          <div className={`rounded-2xl p-4 border ${planoAtivo ? 'bg-green-950 border-green-800' : 'bg-blue-950 border-blue-800'}`}>
            <p className={`text-sm font-semibold ${planoAtivo ? 'text-green-300' : 'text-blue-300'}`}>
              {planoAtivo ? '✓ Plano ativo' : 'Assine para acessar o dashboard'}
            </p>
            <p className="text-gray-500 text-xs mt-1">{loja.nome}</p>
          </div>
        )}

        <div className="bg-gray-900 rounded-2xl p-5 border-2 border-blue-600 relative">
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-xs font-bold px-3 py-1 rounded-full whitespace-nowrap">
            PLANO MENSAL
          </div>

          <div className="flex items-start justify-between mb-4 mt-1">
            <div className="flex items-center gap-2">
              <Zap size={18} className="text-blue-400" />
              <h2 className="text-white font-bold">Acesso completo</h2>
            </div>
            <div className="text-right">
              {!loading && ehFundador ? (
                <>
                  <div className="flex items-center gap-2 justify-end">
                    <span className="text-gray-500 text-sm line-through">{PRECO_NORMAL}</span>
                    <span className="bg-green-600 text-white text-xs font-bold px-1.5 py-0.5 rounded">-46%</span>
                  </div>
                  <p className="text-2xl font-bold text-white">{PRECO_FUNDADOR}</p>
                  <p className="text-gray-400 text-xs">/mês — preço fundador</p>
                </>
              ) : (
                <>
                  <p className="text-2xl font-bold text-white">{PRECO_NORMAL}</p>
                  <p className="text-gray-400 text-xs">/mês</p>
                </>
              )}
            </div>
          </div>

          <ul className="flex flex-col gap-2 mb-5">
            {FEATURES.map(f => (
              <li key={f} className="flex items-center gap-2 text-gray-300 text-sm">
                <CheckCircle size={14} className="text-blue-400 shrink-0" />
                {f}
              </li>
            ))}
          </ul>

          {!loading && (
            temAssinatura ? (
              <div className="flex flex-col gap-2">
                <div className="w-full bg-green-900 text-green-300 font-semibold py-3 rounded-xl text-center text-sm">
                  ✓ Assinatura ativa — cobrança automática mensal
                </div>
                {msgCancelamento ? (
                  <div className="w-full bg-yellow-950 border border-yellow-800 text-yellow-300 text-sm py-3 px-4 rounded-xl text-center">
                    {msgCancelamento}
                  </div>
                ) : (
                  <button
                    onClick={async () => {
                      if (!confirm('Tem certeza que deseja cancelar a assinatura? Você manterá acesso até o fim do período já pago.')) return
                      setCancelando(true)
                      setErroCancelamento(null)
                      try {
                        const res = await fetch('/api/stripe/cancelar-assinatura', { method: 'POST' })
                        const data = await res.json()
                        if (!res.ok) {
                          setErroCancelamento(data?.error || 'Erro ao cancelar')
                        } else {
                          const fim = data?.validoAte
                            ? new Date(data.validoAte).toLocaleDateString('pt-BR')
                            : null
                          setMsgCancelamento(
                            fim
                              ? `Cancelamento agendado. Acesso válido até ${fim}.`
                              : 'Cancelamento agendado. Você manterá acesso até o fim do período.'
                          )
                        }
                      } catch {
                        setErroCancelamento('Erro de conexão. Tente novamente.')
                      } finally {
                        setCancelando(false)
                      }
                    }}
                    disabled={cancelando}
                    className="w-full bg-transparent border border-red-900 text-red-400 hover:bg-red-950 disabled:opacity-60 font-semibold py-2.5 rounded-xl transition text-xs"
                  >
                    {cancelando ? 'Cancelando...' : 'Cancelar assinatura'}
                  </button>
                )}
                {erroCancelamento && (
                  <p className="text-red-400 text-xs text-center">{erroCancelamento}</p>
                )}
              </div>
            ) : (
              <button
                onClick={() => { setAssinando(true); window.location.href = '/api/stripe/assinar' }}
                disabled={assinando}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-bold py-3 rounded-xl transition text-sm"
              >
                {assinando ? 'Redirecionando...' : `Assinar por ${precoAtual}/mês via Stripe`}
              </button>
            )
          )}
        </div>

        {loja && (planoAtivo || temAssinatura) && (
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
