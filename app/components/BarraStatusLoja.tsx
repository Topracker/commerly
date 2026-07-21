'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '../supabase'
import { situacaoPlano } from '../lib/plano'
import { isDelivery } from '../lib/pedidosClientes'
import { AlertTriangle, Power, Loader2 } from 'lucide-react'

type Props = {
  loja: any
  /** Reflete a troca do delivery no estado do dono da página. */
  onLojaAtualizada?: (patch: Record<string, unknown>) => void
}

/**
 * Faixa de estado da loja no topo do app do comerciante. Junta as duas chaves
 * que ele precisa enxergar sempre:
 *
 *  1. PLANO — quantos dias de teste restam / assinatura vencida. Sem isto o
 *     paywall (lib/plano.ts) apareceria do nada num dia qualquer.
 *  2. DELIVERY LIGADO/DESLIGADO — o mutex de "estou aceitando pedidos".
 *     Desligar corta os pedidos novos na raiz (trigger no banco) e expira as
 *     ofertas de corrida abertas, então os entregadores parceiros param de
 *     receber corridas desta loja automaticamente.
 */
export function BarraStatusLoja({ loja, onLojaAtualizada }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  if (!loja) return null

  const { assinante, emTeste, diasDeTeste } = situacaoPlano(loja)
  const delivery = isDelivery(loja.tipo)
  const deliveryAtivo = loja.delivery_ativo !== false

  async function alternarDelivery() {
    const novo = !deliveryAtivo
    setSalvando(true)
    setErro(null)
    const { error } = await supabase.from('lojas').update({ delivery_ativo: novo }).eq('id', loja.id)
    setSalvando(false)
    if (error) { setErro('Não foi possível mudar o status. Tente de novo.'); return }
    onLojaAtualizada?.({ delivery_ativo: novo })
    router.refresh()
  }

  // Teste correndo (ou já vencido): avisa com antecedência crescente.
  const avisoPlano = !assinante && (
    emTeste
      ? {
          urgente: diasDeTeste <= 3,
          texto: diasDeTeste === 1
            ? 'Seu período de teste termina amanhã.'
            : `Seu período de teste termina em ${diasDeTeste} dias.`,
        }
      : { urgente: true, texto: 'Sua assinatura está inativa. O acesso ao painel está bloqueado.' }
  )

  if (!avisoPlano && !delivery) return null

  return (
    <div className="flex flex-col gap-2 mb-4">
      {avisoPlano && (
        <div
          className={`flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2.5 text-sm ${
            avisoPlano.urgente
              ? 'border-red-500/40 bg-red-500/10 text-red-300'
              : 'border-amber-500/40 bg-amber-500/10 text-amber-300'
          }`}
        >
          <AlertTriangle size={15} className="shrink-0" />
          <span className="flex-1 min-w-0">{avisoPlano.texto}</span>
          <button
            onClick={() => router.push('/planos')}
            className="shrink-0 rounded-lg bg-white/10 px-3 py-1 text-xs font-semibold text-white transition hover:bg-white/20"
          >
            Assinar agora
          </button>
        </div>
      )}

      {delivery && (
        <div
          className={`flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2.5 text-sm ${
            deliveryAtivo
              ? 'border-green-500/30 bg-green-500/5 text-green-300'
              : 'border-gray-700 bg-gray-900 text-gray-400'
          }`}
        >
          <Power size={15} className="shrink-0" />
          <span className="flex-1 min-w-0">
            {deliveryAtivo
              ? 'Aceitando pedidos de delivery.'
              : 'Delivery desligado — nenhum pedido novo entra e seus entregadores parceiros não recebem corridas desta loja.'}
          </span>
          <button
            onClick={alternarDelivery}
            disabled={salvando}
            className={`shrink-0 flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-semibold text-white transition disabled:opacity-60 ${
              deliveryAtivo ? 'bg-gray-700 hover:bg-gray-600' : 'bg-green-600 hover:brightness-110'
            }`}
          >
            {salvando && <Loader2 size={12} className="animate-spin" />}
            {deliveryAtivo ? 'Pausar pedidos' : 'Voltar a aceitar'}
          </button>
        </div>
      )}

      {erro && <p className="text-xs text-red-400">{erro}</p>}
    </div>
  )
}
