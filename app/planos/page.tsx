'use client'
import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '../supabase'
import { CheckCircle, Zap } from 'lucide-react'

import { PRECO_FUNDADOR, PRECO_NORMAL, brl, tabelaDescontos } from '../lib/precos'

function PlanosConteudo() {
  const router = useRouter()
  const params = useSearchParams()
  const supabase = createClient()

  const [loja, setLoja] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [assinando, setAssinando] = useState(false)
  const [cancelando, setCancelando] = useState(false)
  const [cancelInfo, setCancelInfo] = useState<{ cancelAtPeriodEnd: boolean; validoAte: string | null } | null>(null)
  const [erroCancelamento, setErroCancelamento] = useState<string | null>(null)
  const [desconto, setDesconto] = useState<{ confirmadas: number; pct: number; preco: number; proxima: { pct: number; preco: number } | null } | null>(null)

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

      // Desconto por indicação (10% por indicação que assinou, até 40%).
      fetch('/api/indicacao/desconto', { cache: 'no-store' })
        .then(r => (r.ok ? r.json() : null))
        .then(d => { if (d && !d.error) setDesconto(d) })
        .catch(() => {})

      if (data?.stripe_subscription_id) {
        try {
          const res = await fetch('/api/stripe/status-assinatura', { cache: 'no-store' })
          if (res.ok) {
            const info = await res.json()
            if (info?.ativa) {
              setCancelInfo({
                cancelAtPeriodEnd: !!info.cancelAtPeriodEnd,
                validoAte: info.validoAte ?? null,
              })
            }
          }
        } catch {}
      }
    })
  }, [])

  const formatarData = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString('pt-BR') : null

  const temAssinatura = !!loja?.stripe_subscription_id
  const planoAtivo = loja?.plano === 'ativo'
  const ehFundador = !!loja?.fundador
  // Base = preço do plano (fundador tem o preço travado). Sobre ela ainda pode
  // incidir o desconto por indicação, que vem do servidor.
  const base = ehFundador ? PRECO_FUNDADOR : PRECO_NORMAL
  const pctIndic = desconto?.pct ?? 0
  const precoFinal = desconto?.preco ?? base
  const precoAtual = brl(precoFinal)
  const offFundador = Math.round((1 - PRECO_FUNDADOR / PRECO_NORMAL) * 100)

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
              {!loading && (ehFundador || pctIndic > 0) && (
                <div className="flex items-center gap-2 justify-end">
                  <span className="text-gray-500 text-sm line-through">{brl(ehFundador ? PRECO_NORMAL : base)}</span>
                  <span className="bg-green-600 text-white text-xs font-bold px-1.5 py-0.5 rounded">
                    -{ehFundador && pctIndic === 0 ? offFundador : Math.round((1 - precoFinal / PRECO_NORMAL) * 100)}%
                  </span>
                </div>
              )}
              <p className="text-2xl font-bold text-white">{loading ? '—' : precoAtual}</p>
              <p className="text-gray-400 text-xs">
                /mês{ehFundador ? ' — preço fundador' : ''}{pctIndic > 0 ? ` · ${pctIndic}% off por indicação` : ''}
              </p>
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
                  {cancelInfo?.cancelAtPeriodEnd
                    ? `✓ Assinatura ativa — acesso até ${formatarData(cancelInfo.validoAte) ?? 'o fim do período'}`
                    : '✓ Assinatura ativa — cobrança automática mensal'}
                </div>
                {!cancelInfo?.cancelAtPeriodEnd && (
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
                          setCancelInfo({
                            cancelAtPeriodEnd: true,
                            validoAte: data?.validoAte ?? cancelInfo?.validoAte ?? null,
                          })
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

        {/* Desconto por indicação — 10% a cada indicação que ASSINA, até 40%. */}
        {loja && (
          <div className="bg-gray-900 rounded-2xl p-5 border border-gray-800">
            <div className="flex items-center justify-between gap-2 mb-1">
              <p className="text-white font-bold text-sm">Indique e pague menos</p>
              <a href="/embaixador" className="text-blue-400 text-xs">Meu código →</a>
            </div>
            <p className="text-gray-400 text-xs mb-3">
              Cada indicação sua que <span className="text-gray-300 font-semibold">assinar</span> vale 10% de desconto na sua
              mensalidade — até 40%. Quem entra pelo seu convite ganha o mesmo desconto na primeira assinatura.
            </p>
            <ul className="flex flex-col gap-1">
              {tabelaDescontos(base).map(f => {
                const atual = (desconto?.confirmadas ?? 0) === f.indicacoes
                  || (f.ultimo && (desconto?.confirmadas ?? 0) > f.indicacoes)
                return (
                  <li
                    key={f.indicacoes}
                    className={`flex items-center justify-between text-xs rounded-lg px-3 py-2 ${atual ? 'bg-blue-950 border border-blue-800' : 'bg-gray-950'}`}
                  >
                    <span className={atual ? 'text-blue-300 font-semibold' : 'text-gray-400'}>
                      {f.indicacoes === 0 ? 'Sem indicações' : `${f.indicacoes}${f.ultimo ? '+' : ''} indicação${f.indicacoes > 1 ? 'ões' : ''}`}
                      {atual ? ' · você' : ''}
                    </span>
                    <span className={atual ? 'text-white font-bold' : 'text-gray-300'}>
                      {f.pct > 0 ? `${f.pct}% off · ` : ''}{brl(f.preco)}
                    </span>
                  </li>
                )
              })}
            </ul>
            {desconto?.proxima && (
              <p className="text-gray-500 text-xs mt-3">
                Falta 1 indicação assinando para você pagar {brl(desconto.proxima.preco)}/mês.
              </p>
            )}
          </div>
        )}

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
