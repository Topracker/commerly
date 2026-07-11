import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from './supabase-admin'
import { FEATURE_FLAGS } from './crescimento'

export type Flags = Record<string, boolean>

const GLOBAL = '__global__'

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
      if (row.cidade_slug === scope) flags[row.flag] = !!row.ativo
    }
  }
  return flags
}

/** Uma flag específica (padrão true se desconhecida). */
export async function flagAtiva(flag: string, cidadeSlug?: string | null, client?: SupabaseClient): Promise<boolean> {
  const flags = await getFlags(cidadeSlug, client)
  return flags[flag] ?? true
}
