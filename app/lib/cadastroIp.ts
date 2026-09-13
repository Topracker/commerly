// ============================================================================
// LIMITE DE CADASTRO POR IP — só servidor (usa service role)
// ----------------------------------------------------------------------------
// Anti-spam básico: no máximo LIMITE_CADASTROS_POR_DIA contas criadas por
// endereço IP em 24h, somando todas as áreas (comerciante / cliente /
// fornecedor / entregador).
//
// Auditoria 2026-09-11 (achado A2): o limite era 1/dia e o IP era gravado
// ANTES do perfil existir. Em CGNAT/Wi-Fi compartilhado a segunda pessoa do
// dia era barrada, e se o insert do perfil falhasse o IP ficava queimado 24h
// à toa. Agora são duas etapas, chamadas pelo client em momentos diferentes:
//
//   1. contarCadastrosDoIp   -> /api/cadastro/checar-ip, ANTES do insert
//   2. registrarCadastroDoIp -> /api/cadastro/registrar, DEPOIS do insert OK
//
// Falha "aberta": se a tabela não existe ou houve erro de infra, não
// bloqueamos cadastro legítimo. Isto é uma barreira de UI — POST direto no
// REST não passa por aqui; a proteção real contra duplicidade é a RLS.
// ============================================================================

import { NextRequest } from 'next/server'
import { createAdminClient } from './supabase-admin'

export const LIMITE_CADASTROS_POR_DIA = 5

const UM_DIA_MS = 24 * 60 * 60 * 1000

/** IP do cliente atrás do proxy da Vercel; 'unknown' quando não há (local). */
export function ipDoRequest(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown'
}

/** Área informada pelo client (só para auditoria na tabela). */
export function areaDoBody(body: unknown): string | null {
  const a = (body as { area?: unknown } | null)?.area
  return typeof a === 'string' ? a.slice(0, 20) : null
}

/** Quantas contas este IP criou nas últimas 24h; null em erro (falha aberta). */
export async function contarCadastrosDoIp(ip: string): Promise<number | null> {
  const admin = createAdminClient()
  const desde = new Date(Date.now() - UM_DIA_MS).toISOString()
  const { count, error } = await admin
    .from('cadastro_ips')
    .select('id', { count: 'exact', head: true })
    .eq('ip', ip)
    .gte('criado_em', desde)
  if (error) {
    console.error('[cadastro-ip] erro ao consultar cadastro_ips:', error.message)
    return null
  }
  return count ?? 0
}

/** Grava que este IP criou uma conta agora. */
export async function registrarCadastroDoIp(ip: string, area: string | null): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin.from('cadastro_ips').insert({ ip, area })
  if (error) console.error('[cadastro-ip] erro ao registrar IP:', error.message)
}

export function msgLimiteAtingido(): string {
  return `Esta rede já criou ${LIMITE_CADASTROS_POR_DIA} contas nas últimas 24 horas. ` +
    'Tente novamente amanhã ou use outra conexão (ex.: dados móveis).'
}
