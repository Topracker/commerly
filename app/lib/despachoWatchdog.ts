import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ofertarProximoEntregador } from './dispatch'
import { RAIO_BUSCA_KM } from './entregadores'
import { dispatchPushPedido } from './pushDispatch'
import {
  avaliarEntregaEmRota, CAMPOS_PEDIDO_EM_ROTA,
  type LojaEntrega, type PedidoEmRota,
} from './entregaConfirmacao'

// ============================================================================
// WATCHDOG DE DESPACHO
// ----------------------------------------------------------------------------
// Antes disto a cadeia de ofertas só andava enquanto a aba do comerciante
// estava aberta: /pedidos fazia polling, via a oferta recusada/expirada e
// chamava /api/entrega/buscar-entregador de novo. Fechou a aba, o pedido ficava
// parado indefinidamente — e ninguém era avisado.
//
// Aqui a cadeia vira responsabilidade do SERVIDOR. A cada passada, para cada
// pedido em andamento e sem entregador:
//
//   1. oferta ao próximo entregador do raio (a lib de despacho já é idempotente
//      enquanto houver oferta pendente válida);
//   2. esgotou o raio  -> marca `despacho_esgotado_em` e avisa "Nenhum
//      entregador disponível";
//   3. esgotado há 5 min -> devolve ao POOL ABERTO: zera o histórico de ofertas
//      (todos voltam a ser elegíveis) e recomeça a cadeia;
//   4. 15 min sem entregador -> alerta AMARELO;
//   5. 30 min sem entregador -> alerta VERMELHO + sugestão de aumentar o raio.
//
// Cada alerta sai UMA vez (a coluna `despacho_alerta` guarda o último enviado).
// ============================================================================

/** Esgotou o raio: tempo até devolver o pedido ao pool aberto. */
export const POOL_APOS_ESGOTAR_MS = 5 * 60_000
/** Sem entregador por este tempo -> alerta amarelo. */
export const ALERTA_AMARELO_MS = 15 * 60_000
/** Sem entregador por este tempo -> alerta vermelho. */
export const ALERTA_VERMELHO_MS = 30 * 60_000

/** Status em que o pedido ainda precisa de entregador. */
const PRECISA_ENTREGADOR = ['recebido', 'preparando']

export type AcaoWatchdog =
  | 'ofertado' | 'esperando' | 'esgotado' | 'pool_liberado'
  | 'alerta_amarelo' | 'alerta_vermelho' | 'sem_localizacao' | 'nada'
  // Entrega JÁ em rota (lib/entregaConfirmacao.ts).
  | 'confirmacao_pedida' | 'entrega_liberada' | 'aguardando_festa'

export type ResultadoWatchdog = { pedido_id: string; acoes: AcaoWatchdog[] }

type PedidoWatchdog = {
  id: string
  loja_id: string
  status: string
  created_at: string
  despacho_esgotado_em: string | null
  despacho_pool_em: string | null
  despacho_alerta: string | null
}

type LojaWatchdog = {
  id: string
  user_id: string
  nome: string | null
  latitude: number | null
  longitude: number | null
  delivery_ativo?: boolean | null
}

/** Notificação de despacho para o dono da loja (silenciosa se algo falhar). */
async function avisarLoja(
  admin: SupabaseClient,
  loja: LojaWatchdog,
  pedidoId: string,
  titulo: string,
  mensagem: string,
  extra: Record<string, unknown> = {},
): Promise<void> {
  try {
    await admin.from('notificacoes').insert({
      user_id: loja.user_id,
      tipo: 'despacho',
      titulo,
      mensagem,
      link: '/pedidos',
      dados: { pedido_id: pedidoId, ...extra },
    })
    await dispatchPushPedido(admin, pedidoId)
  } catch (e) {
    console.error('[watchdog] aviso à loja falhou:', e)
  }
}

/**
 * Uma passada do watchdog sobre um pedido. Devolve as ações tomadas (útil para
 * log e para o painel do comerciante mostrar o que aconteceu).
 */
async function processarPedido(
  admin: SupabaseClient,
  pedido: PedidoWatchdog,
  loja: LojaWatchdog,
): Promise<AcaoWatchdog[]> {
  const acoes: AcaoWatchdog[] = []
  const agora = Date.now()
  const idade = agora - new Date(pedido.created_at).getTime()

  // Loja fechada para delivery: não faz sentido caçar entregador.
  if (loja.delivery_ativo === false) return ['nada']

  // ── 3. Esgotado há 5+ min -> devolve ao pool aberto ─────────────────────
  // Zerar o histórico de ofertas é o que "libera para o pool": todo mundo do
  // raio volta a ser elegível, inclusive quem recusou antes (pode ter ficado
  // livre nesse meio tempo).
  if (
    pedido.despacho_esgotado_em
    && agora - new Date(pedido.despacho_esgotado_em).getTime() >= POOL_APOS_ESGOTAR_MS
    && !pedido.despacho_pool_em
  ) {
    await admin.from('corrida_ofertas').delete().eq('pedido_id', pedido.id).neq('status', 'aceita')
    await admin.from('pedidos_clientes')
      .update({ despacho_pool_em: new Date().toISOString(), despacho_esgotado_em: null })
      .eq('id', pedido.id)
    pedido.despacho_esgotado_em = null
    acoes.push('pool_liberado')
    await avisarLoja(
      admin, loja, pedido.id,
      'Pedido liberado para todos os entregadores 📢',
      'Ninguém do raio aceitou. O pedido voltou para a fila aberta — qualquer entregador parceiro pode pegá-lo agora.',
      { motivo: 'pool' },
    )
  }

  // ── 1 e 2. Anda a cadeia de ofertas ─────────────────────────────────────
  try {
    const r = await ofertarProximoEntregador(admin, pedido.id, loja)
    if (r.tipo === 'ofertado') {
      acoes.push('ofertado')
      // Voltou a ter candidato: o "esgotado" anterior não vale mais.
      if (pedido.despacho_esgotado_em) {
        await admin.from('pedidos_clientes').update({ despacho_esgotado_em: null }).eq('id', pedido.id)
        pedido.despacho_esgotado_em = null
      }
    } else if (r.tipo === 'esperando') {
      acoes.push('esperando')
    } else if (r.tipo === 'sem_localizacao') {
      acoes.push('sem_localizacao')
    } else if (r.tipo === 'esgotado') {
      acoes.push('esgotado')
      if (!pedido.despacho_esgotado_em) {
        await admin.from('pedidos_clientes')
          .update({ despacho_esgotado_em: new Date().toISOString() }).eq('id', pedido.id)
        pedido.despacho_esgotado_em = new Date().toISOString()
        await avisarLoja(
          admin, loja, pedido.id,
          'Nenhum entregador disponível 🛵',
          `Tentamos todos os entregadores online num raio de ${RAIO_BUSCA_KM} km e ninguém aceitou. Em 5 minutos o pedido é liberado para a fila aberta.`,
          { motivo: 'esgotado', tentativas: r.tentativas },
        )
      }
    }
  } catch (e) {
    console.error('[watchdog] oferta falhou para', pedido.id, e)
  }

  // ── 4 e 5. Alertas de demora (uma vez cada, o vermelho substitui o amarelo) ─
  if (idade >= ALERTA_VERMELHO_MS && pedido.despacho_alerta !== 'vermelho') {
    await admin.from('pedidos_clientes').update({ despacho_alerta: 'vermelho' }).eq('id', pedido.id)
    acoes.push('alerta_vermelho')
    await avisarLoja(
      admin, loja, pedido.id,
      '🔴 Pedido há 30 minutos sem entregador',
      `Nenhum entregador aceitou em 30 minutos. Aumente a distância máxima de entrega nas configurações para alcançar mais entregadores, convide parceiros ou entregue por conta própria.`,
      { nivel: 'vermelho', sugestao: 'aumentar_raio' },
    )
  } else if (idade >= ALERTA_AMARELO_MS && !pedido.despacho_alerta) {
    await admin.from('pedidos_clientes').update({ despacho_alerta: 'amarelo' }).eq('id', pedido.id)
    acoes.push('alerta_amarelo')
    await avisarLoja(
      admin, loja, pedido.id,
      '🟡 Pedido há 15 minutos sem entregador',
      'Este pedido ainda não tem quem entregue. Continuamos procurando — fique de olho.',
      { nivel: 'amarelo' },
    )
  }

  return acoes.length > 0 ? acoes : ['nada']
}

/**
 * Entregas JÁ EM ROTA (status 'saiu'): mantém andando a máquina de confirmação
 * pendente de lib/entregaConfirmacao.ts — pergunta ao entregador cujo GPS parou
 * e, vencido o prazo sem resposta, libera o pedido.
 *
 * Sem esta passada, a máquina só andaria enquanto a tela do CLIENTE estivesse
 * aberta (é ela que chama /api/entrega/checar-entregador). Cliente de tela
 * fechada + entregador de tela bloqueada = corrida presa até alguém abrir algo.
 * Aqui o painel do comerciante (poll de 30s) e o cron diário também empurram.
 */
async function rodarEntregasEmRota(
  admin: SupabaseClient,
  lojaId?: string,
  pedidoId?: string,
): Promise<ResultadoWatchdog[]> {
  let q = admin
    .from('pedidos_clientes')
    .select(CAMPOS_PEDIDO_EM_ROTA)
    .eq('status', 'saiu')
    .not('entregador_id', 'is', null)
    .order('updated_at', { ascending: true })
    .limit(lojaId || pedidoId ? 50 : 200)
  if (lojaId) q = q.eq('loja_id', lojaId)
  if (pedidoId) q = q.eq('id', pedidoId)

  const { data } = await q
  const emRota = (data || []) as unknown as PedidoEmRota[]
  if (emRota.length === 0) return []

  const lojaIds = [...new Set(emRota.map(p => p.loja_id))]
  const { data: lojas } = await admin
    .from('lojas').select('id, user_id, nome, latitude, longitude').in('id', lojaIds)
  const mapaLojas = new Map(((lojas || []) as unknown as LojaEntrega[]).map(l => [l.id, l]))

  const resultados: ResultadoWatchdog[] = []
  for (const pedido of emRota) {
    const loja = mapaLojas.get(pedido.loja_id)
    if (!loja) continue
    try {
      const r = await avaliarEntregaEmRota(admin, pedido, loja)
      if (r.estado === 'ok') continue
      const acao: AcaoWatchdog =
        r.estado === 'liberado' ? 'entrega_liberada'
          : r.estado === 'confirmacao_pedida' ? 'confirmacao_pedida'
            : 'aguardando_festa'
      resultados.push({ pedido_id: pedido.id, acoes: [acao] })
    } catch (e) {
      console.error('[watchdog] entrega em rota falhou para', pedido.id, e)
    }
  }
  return resultados
}

/**
 * Roda o watchdog. Sem `lojaId`, varre todos os pedidos pendentes da plataforma
 * (uso do cron); com `lojaId`, só os daquela loja (uso do painel /pedidos, que
 * chama isto periodicamente enquanto o comerciante está com a aba aberta).
 */
export async function rodarWatchdog(
  admin: SupabaseClient,
  lojaId?: string,
  pedidoId?: string,
): Promise<ResultadoWatchdog[]> {
  // Higiene: toda oferta pendente vencida vira 'expirada' antes de qualquer
  // decisão — senão um pedido pareceria "esperando" para sempre.
  await admin.from('corrida_ofertas').update({ status: 'expirada' })
    .eq('status', 'pendente').lt('expira_em', new Date().toISOString())

  // Entregas em rota primeiro. Atenção: o pedido liberado continua em 'saiu'
  // (é o visual "buscando" do cliente), e a varredura abaixo só olha 'recebido'
  // e 'preparando' — quem reoferta é a própria liberação, chamando
  // ofertarProximoEntregador uma vez. Se ESSA oferta esgotar, hoje ninguém
  // retoma a cadeia para um pedido em 'saiu'; é um buraco que já existia antes
  // deste fix e que continua aqui.
  const resultados: ResultadoWatchdog[] = await rodarEntregasEmRota(admin, lojaId, pedidoId)

  let q = admin
    .from('pedidos_clientes')
    .select('id, loja_id, status, created_at, despacho_esgotado_em, despacho_pool_em, despacho_alerta')
    .is('entregador_id', null)
    .in('status', PRECISA_ENTREGADOR)
    .order('created_at', { ascending: true })
    .limit(lojaId || pedidoId ? 50 : 200)
  if (lojaId) q = q.eq('loja_id', lojaId)
  if (pedidoId) q = q.eq('id', pedidoId)

  const { data: pedidos } = await q
  const lista = (pedidos || []) as PedidoWatchdog[]
  if (lista.length === 0) return resultados

  // O watchdog só cuida de pedidos cuja BUSCA JÁ FOI INICIADA — pelo botão
  // "Buscar entregador próximo" ou pelo despacho da festa. Comerciante que
  // entrega por conta própria nunca abriu uma oferta e não deve receber
  // alertas de demora nem ter corridas ofertadas em seu nome.
  const { data: comOferta } = await admin
    .from('corrida_ofertas').select('pedido_id').in('pedido_id', lista.map(p => p.id))
  const iniciados = new Set((comOferta || []).map(o => o.pedido_id as string))
  const alvos = lista.filter(p => iniciados.has(p.id) || p.despacho_pool_em)
  if (alvos.length === 0) return resultados

  const lojaIds = [...new Set(alvos.map(p => p.loja_id))]
  const { data: lojas } = await admin
    .from('lojas').select('id, user_id, nome, latitude, longitude, delivery_ativo').in('id', lojaIds)
  const mapaLojas = new Map((lojas || []).map((l: any) => [l.id, l as LojaWatchdog]))

  for (const pedido of alvos) {
    const loja = mapaLojas.get(pedido.loja_id)
    if (!loja) continue
    const acoes = await processarPedido(admin, pedido, loja)
    resultados.push({ pedido_id: pedido.id, acoes })
  }
  return resultados
}
