'use client'
import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import { AppLayout } from '../components/AppLayout'
import { Toast } from '../components/Toast'
import { Megaphone, Star, TrendingUp, Search, Check } from 'lucide-react'

const PRECO = 'R$ 49,90'

const BENEFICIOS = [
  { icon: Search, titulo: 'Topo da busca', texto: 'Sua loja aparece antes das outras para clientes da sua região.' },
  { icon: Star, titulo: 'Selo de destaque', texto: 'Um badge dourado na busca e no mapa chama atenção.' },
  { icon: TrendingUp, titulo: 'Mais pedidos', texto: 'Mais visibilidade significa mais gente entrando na sua loja.' },
]

// useSearchParams() obriga um limite de Suspense: sem ele o build falha ao
// pré-renderizar a página (missing-suspense-with-csr-bailout).
export default function Ads() {
  return (
    <Suspense fallback={
      <main className="min-h-screen bg-gray-950 flex items-center justify-center">
        <p className="text-gray-400">Carregando...</p>
      </main>
    }>
      <AdsConteudo />
    </Suspense>
  )
}

function AdsConteudo() {
  const { loja, loading, sair } = useAuth()
  const { toast, mostrarToast } = useToast()
  const params = useSearchParams()
  const [cancelando, setCancelando] = useState(false)
  const [destaqueAte, setDestaqueAte] = useState<string | null>(null)
  const [assinaturaId, setAssinaturaId] = useState<string | null>(null)

  useEffect(() => {
    if (!loja) return
    setDestaqueAte(loja.destaque_ate ?? null)
    setAssinaturaId(loja.stripe_ads_subscription_id ?? null)
  }, [loja])

  useEffect(() => {
    const status = params.get('status')
    if (status === 'sucesso') mostrarToast('🎉 Destaque ativado! Pode levar alguns segundos para aparecer.', 'sucesso')
    else if (status === 'ja_ativo') mostrarToast('Você já tem uma assinatura de Ads ativa.', 'erro')
    else if (status === 'erro') mostrarToast('Não foi possível iniciar o checkout.', 'erro')
  }, [params])

  async function cancelar() {
    setCancelando(true)
    const res = await fetch('/api/ads/cancelar', { method: 'POST' })
    const data = await res.json()
    setCancelando(false)
    if (!res.ok) return mostrarToast(data.erro || 'Falha ao cancelar', 'erro')
    setAssinaturaId(null)
    mostrarToast('Assinatura cancelada. O destaque vale até o fim do período pago.', 'sucesso')
  }

  if (loading) return (
    <main className="min-h-screen bg-gray-950 flex items-center justify-center"><p className="text-gray-400">Carregando...</p></main>
  )
  if (!loja) return null

  const ativo = destaqueAte != null && new Date(destaqueAte) > new Date()

  return (
    <AppLayout loja={loja} sair={sair} titulo="Commerly Ads" maxWidth="max-w-3xl">
      <Toast toast={toast} />

      <div className="bg-gradient-to-br from-yellow-950/60 to-gray-900 border border-yellow-900/60 rounded-2xl p-6 mb-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-11 h-11 rounded-xl bg-yellow-500/15 flex items-center justify-center">
            <Megaphone size={20} className="text-yellow-300" />
          </div>
          <div>
            <p className="text-white font-bold text-lg">Destaque sua loja</p>
            <p className="text-gray-400 text-sm">{PRECO}/mês, cancele quando quiser</p>
          </div>
        </div>

        {ativo && (
          <div className="bg-green-950/50 border border-green-800 rounded-xl p-3 mb-4 flex items-center gap-2">
            <Check size={16} className="text-green-400 shrink-0" />
            <p className="text-green-300 text-sm">
              Destaque ativo até{' '}
              <strong>{new Date(destaqueAte!).toLocaleDateString('pt-BR')}</strong>
              {!assinaturaId && ' (sem renovação automática)'}
            </p>
          </div>
        )}

        <div className="flex flex-col gap-3 mb-5">
          {BENEFICIOS.map(b => (
            <div key={b.titulo} className="flex items-start gap-3">
              <b.icon size={16} className="text-yellow-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-white text-sm font-semibold">{b.titulo}</p>
                <p className="text-gray-400 text-xs">{b.texto}</p>
              </div>
            </div>
          ))}
        </div>

        {assinaturaId ? (
          <button
            onClick={cancelar}
            disabled={cancelando}
            className="w-full bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-gray-300 font-semibold py-3 rounded-xl transition"
          >
            {cancelando ? 'Cancelando...' : 'Cancelar assinatura'}
          </button>
        ) : (
          <a
            href="/api/ads/assinar"
            className="block w-full text-center bg-yellow-500 hover:bg-yellow-400 text-gray-950 font-bold py-3 rounded-xl transition"
          >
            {ativo ? 'Reativar renovação' : `Assinar por ${PRECO}/mês`}
          </a>
        )}
      </div>

      <p className="text-gray-600 text-xs">
        O destaque vale por 31 dias e renova automaticamente. Ao cancelar, ele continua ativo
        até o fim do período que você já pagou.
      </p>
    </AppLayout>
  )
}
