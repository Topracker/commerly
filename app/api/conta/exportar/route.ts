import { NextResponse } from 'next/server'
import { createAdminClient } from '../../../lib/supabase-admin'
import { supabaseDaRota, usuarioDaRota } from '../../../lib/rotaSupabase'
import { rateLimit } from '../../../lib/rate-limit'
import type { Checagem } from '../../../lib/exclusaoConta'

export const runtime = 'nodejs'
export const maxDuration = 30

// ============================================================================
// Portabilidade (LGPD art. 18, V) — "Baixar meus dados" antes de excluir.
// Um JSON só, com o que é DO titular. O que é de terceiros (nome/telefone de
// outros clientes num pedido, avaliações que outros fizeram) fica de fora ou
// vai só com o que ele já enxerga no app.
//
// Service role de propósito: a leitura precisa passar por cima da RLS
// `paywall_plano` — comerciante com plano vencido tem direito de levar os
// dados embora; a rota já confirmou que os dados são dele.
// ============================================================================

const LIMITE = 5000

export async function GET() {
  const supabase = await supabaseDaRota()
  const user = await usuarioDaRota(supabase)
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (!rateLimit(`conta-exportar:${user.id}`, 5, 600_000)) {
    return NextResponse.json({ error: 'Muitas tentativas. Aguarde alguns minutos.' }, { status: 429 })
  }

  const admin = createAdminClient()
  const { data: checagem, error } = await admin.rpc('checar_exclusao_conta', { p_user_id: user.id })
  if (error) return NextResponse.json({ error: 'Falha ao consultar a conta' }, { status: 500 })
  const c = checagem as Checagem
  const id = c.perfil_id

  const q = (tabela: string, coluna: string, colunas = '*') =>
    admin.from(tabela).select(colunas).eq(coluna, id!).order('created_at', { ascending: false }).limit(LIMITE).then(r => r.data ?? [])

  const pacote: Record<string, unknown> = {
    gerado_em: new Date().toISOString(),
    conta: { id: user.id, email: user.email, criada_em: user.created_at, papel: c.papel },
  }

  if (c.papel === 'comerciante' && id) {
    const { data: loja } = await admin.from('lojas').select('*').eq('id', id).maybeSingle()
    const [produtos, vendas, gastos, fiado, funcionarios, agendamentos, servicos, pedidosDelivery, pedidosB2B, promocoes, combos, avaliacoes] =
      await Promise.all([
        q('produtos', 'loja_id'), q('vendas', 'loja_id'), q('gastos', 'loja_id'), q('fiado', 'loja_id'),
        q('funcionarios', 'loja_id'), q('agendamentos', 'loja_id'), q('servicos', 'loja_id'),
        q('pedidos_clientes', 'loja_id', 'id, status, itens, total, taxa_entrega, pagamento_metodo, pagamento_status, created_at, updated_at'),
        q('pedidos', 'loja_id'), q('promocoes', 'loja_id'), q('combos', 'loja_id'),
        q('avaliacoes_lojas', 'loja_id', 'nota, comentario, created_at'),
      ])
    Object.assign(pacote, {
      loja, produtos, vendas, gastos, fiado, funcionarios, agendamentos, servicos,
      pedidos_delivery: pedidosDelivery, pedidos_fornecedores: pedidosB2B, promocoes, combos,
      avaliacoes_recebidas: avaliacoes,
    })
  } else if (c.papel === 'cliente' && id) {
    const { data: cliente } = await admin.from('clientes').select('*').eq('id', id).maybeSingle()
    const [pedidos, avaliacoesLojas, avaliacoesEntregadores, pontos, movimentos, mensagens, favoritas] = await Promise.all([
      q('pedidos_clientes', 'cliente_id', 'id, loja_id, status, itens, total, taxa_entrega, endereco_entrega, pagamento_metodo, pagamento_status, created_at'),
      q('avaliacoes_lojas', 'cliente_id', 'loja_id, nota, comentario, created_at'),
      q('avaliacoes_entregadores', 'cliente_id', 'entregador_id, nota, comentario, created_at'),
      admin.from('pontos_clientes').select('loja_id, pontos, total_acumulado, updated_at').eq('cliente_id', id).then(r => r.data ?? []),
      q('clube_movimentos', 'cliente_id'), q('mensagens_clientes', 'cliente_id'),
      q('loja_seguidores', 'cliente_id', 'loja_id, created_at'),
    ])
    Object.assign(pacote, {
      cliente, pedidos, avaliacoes_feitas: { lojas: avaliacoesLojas, entregadores: avaliacoesEntregadores },
      clube: { saldos: pontos, movimentos }, mensagens, lojas_favoritas: favoritas,
    })
  } else if (c.papel === 'entregador' && id) {
    const { data: entregador } = await admin
      .from('entregadores')
      .select('id, nome, telefone, veiculo_tipo, created_at, aprovacao_status, uf, tem_bolsa, stripe_onboarded')
      .eq('id', id).maybeSingle()
    const [corridas, avaliacoes, parcerias, kits] = await Promise.all([
      q('pedidos_clientes', 'entregador_id', 'id, loja_id, status, valor_corrida, distancia_km, pagamento_corrida, created_at, updated_at'),
      q('avaliacoes_entregadores', 'entregador_id', 'nota, comentario, created_at'),
      q('entregador_parcerias', 'entregador_id'), q('kit_pedidos', 'entregador_id'),
    ])
    Object.assign(pacote, { entregador, corridas, avaliacoes_recebidas: avaliacoes, parcerias, kits })
  } else if (c.papel === 'fornecedor' && id) {
    const { data: fornecedor } = await admin.from('fornecedores').select('*').eq('id', id).maybeSingle()
    const [produtos, pedidos, avaliacoes, mensagens] = await Promise.all([
      q('fornecedor_produtos', 'fornecedor_id'), q('pedidos', 'fornecedor_id'),
      q('avaliacoes_fornecedores', 'fornecedor_id', 'nota, comentario, created_at'), q('mensagens', 'fornecedor_id'),
    ])
    Object.assign(pacote, { fornecedor, produtos, pedidos, avaliacoes_recebidas: avaliacoes, mensagens })
  }

  // Comum: gamificação e indicação (é dele).
  const [xp, medalhas, indicacoes] = await Promise.all([
    admin.from('xp_usuarios').select('papel, xp, updated_at').eq('user_id', user.id).maybeSingle().then(r => r.data),
    admin.from('medalhas_usuarios').select('slug, concedida_em').eq('user_id', user.id).then(r => r.data ?? []),
    admin.from('indicacoes').select('codigo, papel_indicado, status, recompensa, created_at').eq('indicador_user_id', user.id).then(r => r.data ?? []),
  ])
  Object.assign(pacote, { gamificacao: { xp, medalhas }, indicacoes_feitas: indicacoes })

  const nome = `commerly-meus-dados-${new Date().toISOString().slice(0, 10)}.json`
  return new NextResponse(JSON.stringify(pacote, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${nome}"`,
      'Cache-Control': 'no-store',
    },
  })
}
