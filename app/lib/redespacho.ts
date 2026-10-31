import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ofertarProximoEntregador } from './dispatch'
import { RAIO_BUSCA_KM } from './entregadores'
import { dispatchPushPedido } from './pushDispatch'

// Pedido que perdeu o entregador ANTES da coleta volta a andar na hora: oferta
// ao próximo do raio (sem quem saiu) e avisa a loja do resultado. Usado pela
// desistência (/api/entregador/desistir-corrida) e pelo "Ficar offline"
// (/api/entregador/ficar-offline). Sem isto o pedido só voltava a andar quando
// o watchdog rodasse — e ele só roda com a aba /pedidos da loja ou a tela do
// cliente abertas.

/**
 * Multi-entrega: sair do lote dissolve o lote inteiro. A rota otimizada foi
 * calculada para os dois pedidos juntos; com um deles de volta ao pool ela não
 * vale mais. Sem isto o pedido voltaria ao pool carregando `lote_entrega_id` —
 * e tanto ele quanto o irmão seriam recusados por /aceitar-junto para sempre.
 */
export async function dissolverLote(admin: SupabaseClient, loteId: string | null | undefined, origem: string) {
  if (!loteId) return
  const { error } = await admin
    .from('pedidos_clientes')
    .update({ lote_entrega_id: null, ordem_coleta: null, ordem_entrega: null })
    .eq('lote_entrega_id', loteId)
  if (error) console.error(`[${origem}] falha ao dissolver o lote:`, error)
}

/**
 * Reoferta + aviso à loja. Best-effort: quem chama já soltou o pedido, e uma
 * falha aqui não pode desfazer isso. Devolve o resultado do despacho (ou
 * 'sem_loja' / 'loja_pausada' / 'erro').
 */
export async function redespacharPedido(
  admin: SupabaseClient,
  pedidoId: string,
  lojaId: string,
  excluir: string[],
  aviso: { titulo: string; motivo: string },
  origem: string,
): Promise<string> {
  try {
    const { data: loja } = await admin
      .from('lojas').select('id, user_id, latitude, longitude, delivery_ativo').eq('id', lojaId).single()
    if (!loja) return 'sem_loja'

    let resultado = 'loja_pausada'
    let texto = 'Procurando outro entregador.'
    if (loja.delivery_ativo !== false) {
      const r = await ofertarProximoEntregador(admin, pedidoId, loja, excluir)
      resultado = r.tipo
      if (r.tipo === 'ofertado' || r.tipo === 'esperando') texto = `Corrida oferecida a ${r.entregador.nome}.`
      else if (r.tipo === 'esgotado') texto = `Nenhum outro entregador disponível num raio de ${RAIO_BUSCA_KM} km agora — continuamos tentando.`
      else if (r.tipo === 'pausado') texto = 'A rede de entregadores está pausada. Entregue este pedido por conta própria.'
    }
    await admin.from('notificacoes').insert({
      user_id: loja.user_id,
      tipo: 'despacho',
      titulo: aviso.titulo,
      mensagem: texto,
      link: '/pedidos',
      dados: { pedido_id: pedidoId, motivo: aviso.motivo },
    })
    await dispatchPushPedido(admin, pedidoId)
    return resultado
  } catch (e) {
    console.error(`[${origem}] redespacho/aviso falhou:`, e)
    return 'erro'
  }
}
