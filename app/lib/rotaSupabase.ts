// Boilerplate compartilhado das rotas de API: cliente Supabase com os cookies
// da requisição, e as buscas de "loja/cliente do usuário logado".

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { SupabaseClient } from '@supabase/supabase-js'

export async function supabaseDaRota(): Promise<SupabaseClient> {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } },
  ) as unknown as SupabaseClient
}

/** Usuário autenticado, ou null. */
export async function usuarioDaRota(supabase: SupabaseClient) {
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

/** Loja (comerciante) do usuário logado. */
export async function lojaDoUsuario(supabase: SupabaseClient, userId: string) {
  const { data } = await supabase.from('lojas').select('*').eq('user_id', userId).maybeSingle()
  return data as Record<string, any> | null
}

/** Perfil de cliente do usuário logado. */
export async function clienteDoUsuario(supabase: SupabaseClient, userId: string) {
  const { data } = await supabase.from('clientes').select('*').eq('user_id', userId).maybeSingle()
  return data as Record<string, any> | null
}

/** IP para chaves de rate limit quando não há sessão. */
export function ipDaRequisicao(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'
}
