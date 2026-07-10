// #12 Radar de tendências — o que está mais pedido na cidade da loja.
//
// Resultado cacheado por 1h em memória do processo. Isso significa cache por
// instância serverless (a Vercel pode ter várias), o que é aceitável: o dado é
// aproximado por natureza e um miss só custa uma query. Se virar gargalo,
// promover para materialized view atualizada pelo cron.

import { NextResponse } from 'next/server'
import { createAdminClient } from '../../lib/supabase-admin'
import { supabaseDaRota, usuarioDaRota, lojaDoUsuario } from '../../lib/rotaSupabase'
import {
  agregarTendencias, normalizarCidade, JANELA_HORAS, MIN_PEDIDOS_CIDADE, type Tendencia,
} from '../../lib/tendencias'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CACHE_MS = 60 * 60_000
const cache = new Map<string, { em: number; valor: Tendencia | null }>()

export async function GET() {
  const supabase = await supabaseDaRota()
  const user = await usuarioDaRota(supabase)
  if (!user) return NextResponse.json({ erro: 'Faça login.' }, { status: 401 })

  const loja = await lojaDoUsuario(supabase, user.id)
  if (!loja) return NextResponse.json({ erro: 'Loja não encontrada.' }, { status: 403 })

  const cidade = normalizarCidade(loja.localizacao as string | null)
  if (!cidade) {
    return NextResponse.json({ tendencia: null, motivo: 'Cadastre a localização da loja para ver as tendências da sua cidade.' })
  }

  const cacheado = cache.get(cidade)
  if (cacheado && Date.now() - cacheado.em < CACHE_MS) {
    return NextResponse.json({ tendencia: cacheado.valor, cacheado: true })
  }

  // Service role: a tendência agrega pedidos de TODAS as lojas da cidade, e a
  // RLS de pedidos_clientes (corretamente) só deixa a loja ver os próprios.
  // Nada de identificável sai daqui — só nome de item e contagem.
  const admin = createAdminClient()

  const { data: lojasCidade } = await admin.from('lojas').select('id, localizacao')
  const idsCidade = (lojasCidade ?? [])
    .filter(l => normalizarCidade(l.localizacao) === cidade)
    .map(l => l.id)

  if (idsCidade.length === 0) {
    cache.set(cidade, { em: Date.now(), valor: null })
    return NextResponse.json({ tendencia: null, motivo: 'Ainda não há lojas suficientes na sua cidade.' })
  }

  const desde = new Date(Date.now() - JANELA_HORAS * 60 * 60_000).toISOString()
  const { data: pedidos, error } = await admin
    .from('pedidos_clientes')
    .select('loja_id, itens')
    .in('loja_id', idsCidade)
    .gte('created_at', desde)
    .neq('status', 'cancelado')
    .limit(2000)

  if (error) {
    console.error('[tendencias] erro ao agregar:', error.message)
    return NextResponse.json({ erro: 'Falha ao calcular tendências.' }, { status: 500 })
  }

  // Sem massa crítica, um único pedido viraria "tendência da cidade".
  if (!pedidos || pedidos.length < MIN_PEDIDOS_CIDADE) {
    cache.set(cidade, { em: Date.now(), valor: null })
    return NextResponse.json({
      tendencia: null,
      motivo: `Poucos pedidos na sua cidade nas últimas ${JANELA_HORAS}h para apontar uma tendência.`,
    })
  }

  const tendencia: Tendencia = {
    cidade,
    itens: agregarTendencias(pedidos),
    pedidos: pedidos.length,
    atualizadoEm: new Date().toISOString(),
  }

  cache.set(cidade, { em: Date.now(), valor: tendencia })
  return NextResponse.json({ tendencia, cacheado: false })
}
