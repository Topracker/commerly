import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ofertarProximoEntregador } from './dispatch'
import { ofertarFesta } from './festaDispatch'
import { dispatchPushPedido } from './pushDispatch'
import { GPS_SEM_SINAL_MS, CONFIRMACAO_ENTREGA_MS } from './entregadores'

// ============================================================================
// ENTREGADOR SUMIDO EM ROTA — confirmação pendente
// ----------------------------------------------------------------------------
// O GPS do entregador congela quando ele bloqueia a tela: o navegador suspende
// o JS e o `upsert` de posição simplesmente para. Antes disto, 10 min sem GPS
// liberavam o pedido para outro entregador SEM AVISAR NINGUÉM — nem quem estava
// com o pedido em mãos, nem a loja. O sujeito chegava no cliente com uma corrida
// que já não era dele.
//
// Agora a inatividade abre uma PERGUNTA, e a liberação vira consequência:
//
//   GPS_SEM_SINAL_MS (6 min) sem posição -> `entrega_confirmacao_pedida_em`:
//      pergunta ao entregador (notificação + push) e alerta a loja, que ganha
//      o botão "Liberar para outro entregador".
//   + CONFIRMACAO_ENTREGA_MS (4 min) sem resposta E sem GPS novo -> libera.
//
// As duas janelas somam os mesmos 10 min de antes: o cliente não espera mais do
// que esperava, e agora a loja pode encurtar para ~6 min com um clique.
//
// CUIDADO COM O RELÓGIO: o guard do banco (`pedidos_clientes_guard`) faz
// `new.updated_at := now()` em TODO update. Abrir a pendência é um update, então
// `updated_at` não serve de referência para a segunda janela — ela é medida a
// partir de `entrega_confirmacao_pedida_em`, e "sinal novo" considera só GPS e
// confirmação explícita. Medir pelo `updated_at` faria a pendência se resolver
// sozinha no primeiro poll seguinte, e ninguém seria liberado nunca.
// ============================================================================

export type PedidoEmRota = {
  id: string
  loja_id: string
  cliente_id: string | null
  entregador_id: string | null
  status: string
  updated_at: string
  lote_entrega_id: string | null
  festa_id: string | null
  entrega_confirmacao_pedida_em: string | null
  entrega_confirmada_em: string | null
}

/** Colunas que `avaliarEntregaEmRota` precisa — use no `.select()` de quem chama. */
export const CAMPOS_PEDIDO_EM_ROTA =
  'id, loja_id, cliente_id, entregador_id, status, updated_at, lote_entrega_id, festa_id, '
  + 'entrega_confirmacao_pedida_em, entrega_confirmada_em'

export type LojaEntrega = {
  id: string
  user_id: string
  nome?: string | null
  latitude: number | null
  longitude: number | null
}

export type EstadoEntregaEmRota =
  /** GPS em dia (ou pedido fora de rota): nada a fazer. */
  | 'ok'
  /** Perguntamos ao entregador e o prazo ainda corre. */
  | 'confirmacao_pedida'
  /** Pedido devolvido ao pool. */
  | 'liberado'
  /** Prazo venceu, mas é pedido de FESTA: só a loja libera (ver liberarFesta). */
  | 'aguardando_festa'

export type ResultadoEntregaEmRota = {
  estado: EstadoEntregaEmRota
  prazo_em: string | null
  redispatch?: string
}

export type MotivoLiberacao = 'sem_resposta' | 'loja'

const MIN_CONFIRMACAO = Math.round(CONFIRMACAO_ENTREGA_MS / 60_000)

// ── Auxiliares ──────────────────────────────────────────────────────────────

/** Insert best-effort em `notificacoes` — aviso nunca derruba a ação principal. */
async function notificar(
  admin: SupabaseClient,
  userId: string | null | undefined,
  tipo: string,
  titulo: string,
  mensagem: string,
  link: string,
  dados: Record<string, unknown>,
): Promise<void> {
  if (!userId) return
  try {
    const { error } = await admin.from('notificacoes').insert({ user_id: userId, tipo, titulo, mensagem, link, dados })
    // O CHECK de `notificacoes.tipo` devolve erro quando o tipo não está na
    // lista (foi preciso um ALTER para 'entrega_confirmar'): logar é o que
    // salva o debug se alguém esquecer o SQL numa próxima.
    if (error) console.error('[entregaConfirmacao] notificação falhou:', tipo, error.message)
  } catch (e) {
    console.error('[entregaConfirmacao] notificação falhou:', tipo, e)
  }
}

async function usuarioDoEntregador(admin: SupabaseClient, entregadorId: string | null) {
  if (!entregadorId) return null
  const { data } = await admin.from('entregadores').select('user_id, nome').eq('id', entregadorId).maybeSingle()
  return (data as { user_id: string; nome: string | null } | null) ?? null
}

async function usuarioDoCliente(admin: SupabaseClient, clienteId: string | null) {
  if (!clienteId) return null
  const { data } = await admin.from('clientes').select('user_id').eq('id', clienteId).maybeSingle()
  return (data as { user_id: string } | null)?.user_id ?? null
}

/**
 * Momento do último GPS que VALE para este pedido.
 *
 * `entregas_localizacao` tem PRIMARY KEY (pedido_id) — uma linha por pedido — e
 * as policies de escrita só checam "sou este entregador", não "sou o entregador
 * DESTE pedido" (a correção está em
 * sql/2026-09-13-entregas-localizacao-policy-dono-do-pedido.sql, ainda NÃO
 * aplicada). Enquanto isso, o app congelado do entregador ANTIGO consegue
 * continuar gravando aqui depois do repasse — e era esse fantasma que renovava
 * o relógio, fazendo o entregador novo nunca ser considerado inativo. Linha que
 * não é do entregador atual do pedido: ignorada.
 */
async function ultimoGpsMs(admin: SupabaseClient, pedido: PedidoEmRota): Promise<number | null> {
  const { data: loc } = await admin
    .from('entregas_localizacao').select('updated_at, entregador_id').eq('pedido_id', pedido.id).maybeSingle()
  const l = loc as { updated_at: string; entregador_id: string } | null
  if (!l || l.entregador_id !== pedido.entregador_id) return null
  return new Date(l.updated_at).getTime()
}

function ms(iso: string | null): number {
  return iso ? new Date(iso).getTime() : 0
}

// ── Avaliação (o coração) ───────────────────────────────────────────────────

/**
 * Uma passada sobre um pedido EM ROTA. Decide sozinha — quem chama (tela do
 * cliente, watchdog do painel da loja) só pede a passada, nunca escolhe liberar.
 */
export async function avaliarEntregaEmRota(
  admin: SupabaseClient,
  pedido: PedidoEmRota,
  loja: LojaEntrega,
): Promise<ResultadoEntregaEmRota> {
  // Só entrega em rota tem GPS para monitorar.
  if (pedido.status !== 'saiu' || !pedido.entregador_id) return { estado: 'ok', prazo_em: null }

  const agora = Date.now()
  const gps = await ultimoGpsMs(admin, pedido)

  // ── Sem pendência aberta: primeira janela ────────────────────────────────
  if (!pedido.entrega_confirmacao_pedida_em) {
    // Sem GPS ainda, vale o momento em que o pedido mudou de estado (saiu para
    // entrega) ou a última confirmação dele.
    const ref = Math.max(gps ?? 0, ms(pedido.entrega_confirmada_em), ms(pedido.updated_at))
    if (agora - ref <= GPS_SEM_SINAL_MS) return { estado: 'ok', prazo_em: null }
    return pedirConfirmacao(admin, pedido, loja)
  }

  // ── Pendência aberta: segunda janela ─────────────────────────────────────
  const pedidaMs = ms(pedido.entrega_confirmacao_pedida_em)
  const prazoEm = new Date(pedidaMs + CONFIRMACAO_ENTREGA_MS).toISOString()

  // Sinal novo DEPOIS da pergunta: GPS voltou (ele desbloqueou a tela) ou ele
  // respondeu. `updated_at` de propósito fora da conta — ver cabeçalho.
  const sinalNovo = Math.max(gps ?? 0, ms(pedido.entrega_confirmada_em))
  if (sinalNovo > pedidaMs) {
    await limparPendencia(admin, pedido)
    return { estado: 'ok', prazo_em: null }
  }

  if (agora - pedidaMs < CONFIRMACAO_ENTREGA_MS) {
    return { estado: 'confirmacao_pedida', prazo_em: prazoEm }
  }

  // FESTA: a corrida cobre vários pedidos num endereço só e a oferta é por
  // `festa_id`. Liberar um pedido isolado quebraria o grupo, então aqui só
  // alertamos — quem libera (a festa inteira) é a loja, por botão.
  if (pedido.festa_id) return { estado: 'aguardando_festa', prazo_em: prazoEm }

  return liberarEntregador(admin, pedido, loja, 'sem_resposta')
}

/** Abre a pendência: grava o marco, pergunta ao entregador e alerta a loja. */
async function pedirConfirmacao(
  admin: SupabaseClient,
  pedido: PedidoEmRota,
  loja: LojaEntrega,
): Promise<ResultadoEntregaEmRota> {
  const agoraIso = new Date().toISOString()
  const prazoEm = new Date(Date.now() + CONFIRMACAO_ENTREGA_MS).toISOString()

  // `.is(...null)` torna a abertura idempotente: a tela do cliente e o painel da
  // loja chamam isto em paralelo e só o primeiro pode notificar. `.select()`
  // porque update sem select não distingue "não bateu" de "bateu" (RLS e filtros
  // devolvem 204 sem `error`).
  const { data: rows, error } = await admin
    .from('pedidos_clientes')
    .update({ entrega_confirmacao_pedida_em: agoraIso })
    .eq('id', pedido.id)
    .eq('entregador_id', pedido.entregador_id)
    .is('entrega_confirmacao_pedida_em', null)
    .select('id')
  if (error) {
    console.error('[entregaConfirmacao] falha ao abrir a pendência:', error.message)
    return { estado: 'ok', prazo_em: null }
  }
  if (!rows || rows.length === 0) {
    // Alguém abriu primeiro (ou o pedido mudou de mãos): estado já correto.
    return { estado: 'confirmacao_pedida', prazo_em: prazoEm }
  }

  const ent = await usuarioDoEntregador(admin, pedido.entregador_id)
  const auto = !pedido.festa_id

  await notificar(
    admin, ent?.user_id, 'entrega_confirmar',
    'Ainda está com o pedido? 🛵',
    'Sua localização parou de chegar até nós. Toque para confirmar que segue com a entrega'
    + (auto ? ` — em ${MIN_CONFIRMACAO} minutos o pedido é repassado a outro entregador.` : '.'),
    '/entregador-delivery/dashboard',
    { pedido_id: pedido.id, loja_id: pedido.loja_id, prazo_em: prazoEm },
  )

  await notificar(
    admin, loja.user_id, 'despacho',
    'Entregador sem sinal 📍',
    `O GPS de ${ent?.nome || 'seu entregador'} parou de atualizar. Já perguntamos se ele ainda está com o pedido`
    + (auto
      ? ` — se não responder em ${MIN_CONFIRMACAO} minutos, repassamos automaticamente. Você também pode liberar agora.`
      : '. Pedido de festa não é repassado automaticamente: se precisar, libere pelo painel.'),
    '/pedidos',
    { pedido_id: pedido.id, motivo: 'gps_sem_sinal', prazo_em: prazoEm },
  )

  // Um disparo cobre os dois: o push lê as notificações dos últimos 45s deste
  // pedido e manda uma por destinatário.
  await dispatchPushPedido(admin, pedido.id)

  return { estado: 'confirmacao_pedida', prazo_em: prazoEm }
}

/** GPS voltou: fecha a pendência sem alarde (ninguém precisa ser avisado). */
async function limparPendencia(admin: SupabaseClient, pedido: PedidoEmRota): Promise<void> {
  const { error } = await admin
    .from('pedidos_clientes')
    .update({ entrega_confirmacao_pedida_em: null })
    .eq('id', pedido.id)
    .eq('entregador_id', pedido.entregador_id)
    .select('id')
  if (error) console.error('[entregaConfirmacao] falha ao limpar a pendência:', error.message)
}

// ── Ações ───────────────────────────────────────────────────────────────────

/**
 * "Sim, estou com o pedido": fecha a pendência e reinicia o relógio.
 * Devolve false quando o pedido já não é dele (perdeu a corrida no meio-tempo).
 */
export async function confirmarEntregaEmRota(
  admin: SupabaseClient,
  pedido: PedidoEmRota,
  loja: LojaEntrega,
): Promise<boolean> {
  const { data: rows, error } = await admin
    .from('pedidos_clientes')
    .update({ entrega_confirmada_em: new Date().toISOString(), entrega_confirmacao_pedida_em: null })
    .eq('id', pedido.id)
    .eq('entregador_id', pedido.entregador_id)
    .select('id')
  if (error) {
    console.error('[entregaConfirmacao] falha ao confirmar:', error.message)
    return false
  }
  if (!rows || rows.length === 0) return false

  const ent = await usuarioDoEntregador(admin, pedido.entregador_id)
  await notificar(
    admin, loja.user_id, 'despacho',
    'Entregador confirmou a entrega ✅',
    `${ent?.nome || 'O entregador'} confirmou que está com o pedido e segue para o cliente.`,
    '/pedidos',
    { pedido_id: pedido.id, motivo: 'entrega_confirmada' },
  )
  await dispatchPushPedido(admin, pedido.id)
  return true
}

/**
 * Devolve o pedido ao pool e oferta ao próximo. É o bloco que antes vivia inline
 * em /api/entrega/checar-entregador, agora com dissolução de lote e avisos aos
 * TRÊS papéis (antes só o cliente era notificado).
 */
export async function liberarEntregador(
  admin: SupabaseClient,
  pedido: PedidoEmRota,
  loja: LojaEntrega,
  motivo: MotivoLiberacao,
): Promise<ResultadoEntregaEmRota> {
  const antigo = pedido.entregador_id
  if (!antigo) return { estado: 'ok', prazo_em: null }

  const ent = await usuarioDoEntregador(admin, antigo)

  const { data: rows, error } = await admin
    .from('pedidos_clientes')
    .update({
      entregador_id: null, entrega_confirmacao_pedida_em: null, entrega_confirmada_em: null,
      // Estado de despacho da RODADA ANTERIOR não vale para a nova busca. Sem
      // zerar aqui, um pedido que já tinha ido ao pool antes de ser aceito
      // voltaria com `despacho_pool_em` preenchido — e o guard do passo 3 do
      // watchdog (`!pedido.despacho_pool_em`) nunca mais o devolveria ao pool,
      // deixando a cadeia morrer de vez quando o raio esgotasse.
      despacho_esgotado_em: null, despacho_pool_em: null, despacho_alerta: null,
    })
    .eq('id', pedido.id)
    .eq('entregador_id', antigo)
    .select('id')
  if (error) {
    console.error('[entregaConfirmacao] falha ao liberar:', error.message)
    throw new Error('Erro ao liberar o pedido.')
  }
  // Zero linhas = outra chamada já liberou (poll do cliente e botão da loja ao
  // mesmo tempo). Não é erro, e não pode notificar duas vezes.
  if (!rows || rows.length === 0) return { estado: 'liberado', prazo_em: null, redispatch: 'ja_liberado' }

  // MULTI-ENTREGA: sair do lote dissolve o lote inteiro — a rota foi calculada
  // para os dois pedidos juntos e não vale mais. Sem isto o pedido voltaria ao
  // pool carregando `lote_entrega_id` e tanto ele quanto o irmão seriam
  // recusados por /aceitar-junto para sempre (mesmo motivo do desistir-corrida).
  if (pedido.lote_entrega_id) {
    const { error: loteErr } = await admin
      .from('pedidos_clientes')
      .update({ lote_entrega_id: null, ordem_coleta: null, ordem_entrega: null })
      .eq('lote_entrega_id', pedido.lote_entrega_id)
    if (loteErr) console.error('[entregaConfirmacao] falha ao dissolver o lote:', loteErr.message)
  }

  // Encerra a oferta aceita do entregador que saiu e limpa o GPS obsoleto.
  await admin.from('corrida_ofertas').update({ status: 'expirada' })
    .eq('pedido_id', pedido.id).eq('entregador_id', antigo).eq('status', 'aceita')
  await admin.from('entregas_localizacao').delete().eq('pedido_id', pedido.id)

  const porLoja = motivo === 'loja'
  await notificar(
    admin, ent?.user_id, 'despacho',
    'Corrida repassada a outro entregador',
    porLoja
      ? 'A loja repassou esta entrega a outro entregador porque sua localização parou de chegar. Se você está com o pedido, fale com a loja agora.'
      : 'Não recebemos sua confirmação nem sua localização, então a entrega foi repassada. Se você está com o pedido, fale com a loja agora.',
    '/entregador-delivery/dashboard',
    { pedido_id: pedido.id, motivo },
  )
  await notificar(
    admin, loja.user_id, 'despacho',
    'Pedido liberado para outro entregador 🔄',
    porLoja
      ? 'Você liberou o pedido. Já estamos chamando outro entregador.'
      : `O entregador não respondeu em ${MIN_CONFIRMACAO} minutos. Já estamos chamando outro.`,
    '/pedidos',
    { pedido_id: pedido.id, motivo },
  )
  await notificar(
    admin, await usuarioDoCliente(admin, pedido.cliente_id), 'pedido_status',
    'Buscando novo entregador 🔄',
    'Seu entregador ficou indisponível. Já estamos chamando outro para concluir sua entrega.',
    '/cliente/pedidos',
    { pedido_id: pedido.id, status: 'saiu', loja_id: pedido.loja_id },
  )
  await dispatchPushPedido(admin, pedido.id)

  // Esta reoferta alcança só quem NUNCA recebeu oferta deste pedido: o
  // histórico em `corrida_ofertas` continua valendo como "já tentei com esse".
  // Na prática ela costuma esgotar em segundos, e quem reabre o leque é o passo
  // 3 do watchdog, 5 min depois (apaga as ofertas não-aceitas e todo o raio
  // volta a ser elegível).
  //
  // MELHORIA FUTURA, deliberadamente fora deste fix: limpar aqui as ofertas
  // não-aceitas — exceto a do entregador que acabou de cair, que está com a tela
  // travada e só queimaria os 30s da janela — daria retentativa ampla imediata
  // em vez de esperar os 5 min. É mudança de POLÍTICA de despacho, não conserto
  // do buraco de reoferta; merece decisão própria.
  let redispatch = 'sem_loja'
  try {
    const r = await ofertarProximoEntregador(admin, pedido.id, loja)
    redispatch = r.tipo
  } catch (e) {
    console.error('[entregaConfirmacao] redispatch falhou:', e)
    redispatch = 'erro'
  }

  return { estado: 'liberado', prazo_em: null, redispatch }
}

/**
 * Liberação manual de um pedido de FESTA: solta a festa INTEIRA e reoferta por
 * `ofertarFesta`. A oferta de festa aponta para `festa_id` e atribui todos os
 * pedidos de uma vez — liberar um só deixaria o grupo meio atribuído, com o
 * endereço único dividido entre dois entregadores.
 */
export async function liberarFesta(
  admin: SupabaseClient,
  pedido: PedidoEmRota,
  loja: LojaEntrega,
): Promise<ResultadoEntregaEmRota> {
  const festaId = pedido.festa_id
  const antigo = pedido.entregador_id
  if (!festaId || !antigo) return { estado: 'ok', prazo_em: null }

  const ent = await usuarioDoEntregador(admin, antigo)

  const { data: irmaos } = await admin
    .from('pedidos_clientes').select(CAMPOS_PEDIDO_EM_ROTA)
    .eq('festa_id', festaId).eq('entregador_id', antigo).neq('status', 'cancelado')
  const alvos = (irmaos || []) as unknown as PedidoEmRota[]
  if (alvos.length === 0) return { estado: 'liberado', prazo_em: null, redispatch: 'ja_liberado' }

  const { data: rows, error } = await admin
    .from('pedidos_clientes')
    .update({
      entregador_id: null, entrega_confirmacao_pedida_em: null, entrega_confirmada_em: null,
      // Mesma limpeza da liberação individual: a nova rodada começa do zero.
      // (A festa não é varrida pelo watchdog — quem reoferta é `ofertarFesta`,
      // logo abaixo — mas deixar lixo de despacho na linha só confunde o painel.)
      despacho_esgotado_em: null, despacho_pool_em: null, despacho_alerta: null,
    })
    .eq('festa_id', festaId).eq('entregador_id', antigo).neq('status', 'cancelado')
    .select('id')
  if (error) {
    console.error('[entregaConfirmacao] falha ao liberar a festa:', error.message)
    throw new Error('Erro ao liberar a festa.')
  }
  if (!rows || rows.length === 0) return { estado: 'liberado', prazo_em: null, redispatch: 'ja_liberado' }

  await admin.from('corrida_ofertas').update({ status: 'expirada' })
    .eq('festa_id', festaId).eq('entregador_id', antigo).eq('status', 'aceita')
  await admin.from('entregas_localizacao').delete().in('pedido_id', alvos.map(p => p.id))

  await notificar(
    admin, ent?.user_id, 'despacho',
    'Corrida de festa repassada',
    'A loja repassou esta festa a outro entregador porque sua localização parou de chegar. Se você está com os pedidos, fale com a loja agora.',
    '/entregador-delivery/dashboard',
    { pedido_id: pedido.id, festa_id: festaId, motivo: 'loja' },
  )
  await notificar(
    admin, loja.user_id, 'despacho',
    'Festa liberada para outro entregador 🔄',
    `Você liberou os ${alvos.length} pedidos desta festa. Já estamos chamando outro entregador.`,
    '/pedidos',
    { pedido_id: pedido.id, festa_id: festaId, motivo: 'loja' },
  )
  for (const p of alvos) {
    await notificar(
      admin, await usuarioDoCliente(admin, p.cliente_id), 'pedido_status',
      'Buscando novo entregador 🔄',
      'Seu entregador ficou indisponível. Já estamos chamando outro para concluir sua entrega.',
      '/cliente/pedidos',
      { pedido_id: p.id, status: p.status, loja_id: p.loja_id },
    )
  }
  await dispatchPushPedido(admin, pedido.id)

  let redispatch = 'erro'
  try {
    const r = await ofertarFesta(admin, festaId)
    redispatch = r.tipo
  } catch (e) {
    console.error('[entregaConfirmacao] reoferta de festa falhou:', e)
  }

  return { estado: 'liberado', prazo_em: null, redispatch }
}
