import type { SupabaseClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { createAdminClient } from './supabase-admin'
import { FEATURE_FLAGS } from './crescimento'
import { MSG_MODULO_INDISPONIVEL, TEXTO_PAUSA, mapaPublico, type LinhaFlag, type ModuloPausavel } from './pausa'

export type Flags = Record<string, boolean>

const GLOBAL = '__global__'

/** Chaves de módulo: só valem no escopo global (ver FEATURE_FLAGS). */
export type ModuloGlobal = 'cliente' | 'entregador' | 'fornecedor'
const FLAGS_GLOBAIS = new Set(FEATURE_FLAGS.filter(f => f.global).map(f => f.flag))

/** A flag só existe no escopo global? (linha de cidade é ignorada) */
export function flagSoGlobal(flag: string): boolean {
  return FLAGS_GLOBAIS.has(flag)
}

/** Todas as flags padrão (tudo ligado) quando não há linhas no banco. */
function padrao(): Flags {
  const f: Flags = {}
  for (const { flag } of FEATURE_FLAGS) f[flag] = true
  return f
}

/**
 * Flags efetivas para uma cidade: começa nos padrões globais e aplica os
 * overrides específicos da cidade por cima. Sem cidade → só o global.
 */
export async function getFlags(cidadeSlug?: string | null, client?: SupabaseClient): Promise<Flags> {
  const admin = client ?? createAdminClient()
  const alvos = cidadeSlug ? [GLOBAL, cidadeSlug] : [GLOBAL]
  const { data } = await admin.from('feature_flags').select('cidade_slug, flag, ativo').in('cidade_slug', alvos)
  const flags = padrao()
  // Aplica global primeiro, depois cidade (ordem importa).
  for (const scope of alvos) {
    for (const row of data || []) {
      if (row.cidade_slug !== scope) continue
      // Chave de módulo não tem override por cidade — mesma regra do SQL.
      if (scope !== GLOBAL && FLAGS_GLOBAIS.has(row.flag)) continue
      flags[row.flag] = !!row.ativo
    }
  }
  return flags
}

/**
 * Chave de módulo ligada? Só o escopo global; sem linha = ligado. Espelho de
 * `modulo_ativo()` no SQL — mexeu em um, mexa no outro. (O SQL responde também
 * por 'modo_festa', no escopo global, para o proxy; aqui a festa usa flagAtiva.)
 */
export async function moduloAtivo(modulo: ModuloGlobal, client?: SupabaseClient): Promise<boolean> {
  const admin = client ?? createAdminClient()
  const { data } = await admin.from('feature_flags').select('ativo')
    .eq('cidade_slug', GLOBAL).eq('flag', modulo).maybeSingle()
  return data ? !!data.ativo : true
}

/**
 * Pode nascer oferta de corrida para a frota Commerly nesta cidade? Demanda
 * (`delivery`, por cidade) E oferta (`entregador`, global). Ponto ÚNICO da
 * combinação: despacho, Modo Festa e "Buscar entregador" chamam só isto, nunca
 * as duas flags soltas. Com `entregador` desligado o pedido continua entrando
 * (a loja entrega por conta própria) — quem barra pedido é só `delivery`.
 */
export async function despachoLiberado(cidadeSlug: string | null | undefined, client?: SupabaseClient): Promise<boolean> {
  const admin = client ?? createAdminClient()
  const [delivery, entregador] = await Promise.all([
    flagAtiva('delivery', cidadeSlug, admin),
    moduloAtivo('entregador', admin),
  ])
  return delivery && entregador
}

/** Texto do aviso de módulo pausado (503 das rotas e faixa das listas vazias). */
export const MSG_PAUSA: Record<ModuloGlobal, string> = {
  cliente: 'A área do cliente está pausada no momento. Pedidos em andamento continuam normalmente.',
  entregador: 'A rede de entregadores está pausada no momento. Corridas em andamento continuam normalmente.',
  fornecedor: 'As compras de fornecedores estão pausadas no momento. Pedidos já feitos continuam normalmente.',
}

/**
 * Resposta padrão de rota que INICIA algo num módulo desligado. 503 (pausa
 * temporária, não falta de permissão) com `modulo_pausado` para a tela tratar.
 * Rota que TERMINA algo (confirmar, cancelar, estornar, webhook) nunca usa isto.
 * O proxy responde no mesmo formato, para quem chega nele antes da rota.
 */
export function respostaModuloPausado(modulo: ModuloPausavel) {
  const detalhe = (MSG_PAUSA as Partial<Record<ModuloPausavel, string>>)[modulo] ?? TEXTO_PAUSA[modulo].titulo
  return NextResponse.json({
    error: `${MSG_MODULO_INDISPONIVEL}. ${detalhe}`,
    erro: `${MSG_MODULO_INDISPONIVEL}. ${detalhe}`,
    modulo_pausado: modulo,
  }, { status: 503 })
}

/** Chaves como as telas públicas veem: sem cidade, delivery ligado se houver alguma cidade. */
export async function flagsPublicas(client?: SupabaseClient): Promise<Record<ModuloPausavel, boolean>> {
  const admin = client ?? createAdminClient()
  const { data } = await admin.from('feature_flags').select('flag, cidade_slug, ativo')
  return mapaPublico((data || []) as LinhaFlag[])
}

/** Uma flag específica (padrão true se desconhecida). */
export async function flagAtiva(flag: string, cidadeSlug?: string | null, client?: SupabaseClient): Promise<boolean> {
  const flags = await getFlags(cidadeSlug, client)
  return flags[flag] ?? true
}

/**
 * Descobre a cidade (slug) de um usuário. Só as lojas carregam cidade_slug
 * resolvido (clientes/entregadores só têm uf), então overrides por cidade
 * valem principalmente para comerciantes; os demais caem no escopo global.
 */
export async function cidadeSlugDoUsuario(userId: string, client?: SupabaseClient): Promise<string | null> {
  const admin = client ?? createAdminClient()
  const { data } = await admin.from('lojas').select('cidade_slug').eq('user_id', userId).maybeSingle()
  return (data?.cidade_slug as string | null) ?? null
}

/** Flags efetivas para o usuário logado (global + overrides da cidade dele). */
export async function flagsDoUsuario(userId: string | null | undefined, client?: SupabaseClient): Promise<Flags> {
  const admin = client ?? createAdminClient()
  const cidade = userId ? await cidadeSlugDoUsuario(userId, admin) : null
  const flags = await getFlags(cidade, admin)
  // Sem cidade (visitante, cliente, entregador): com global OFF e Goiânia ON, o
  // módulo existe. Sem isto, a tela escondia de quem não tem loja o que está aberto.
  if (cidade) return flags
  return { ...flags, ...(await flagsPublicas(admin)) }
}
