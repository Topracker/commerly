import 'server-only'
import { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '../../lib/supabase-admin'

// Autenticação compartilhada das rotas de festa: resolve o cliente dono da
// sessão. Todas as rotas de festa rodam com service role (as tabelas têm RLS
// sem policies — o acesso é sempre pelo servidor, com a autorização aqui).

export type FestaCtx = {
  admin: ReturnType<typeof createAdminClient>
  cliente: { id: string; nome: string | null; telefone: string | null; user_id: string }
}

export async function autenticarCliente(): Promise<
  { ok: true; ctx: FestaCtx } | { ok: false; status: number; error: string }
> {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } },
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, status: 401, error: 'Não autorizado' }

  const admin = createAdminClient()
  const { data: cliente } = await admin
    .from('clientes').select('id, nome, telefone, user_id').eq('user_id', user.id).single()
  if (!cliente) return { ok: false, status: 403, error: 'Perfil de cliente não encontrado.' }

  return { ok: true, ctx: { admin, cliente } }
}

export function bodyDe(request: NextRequest): Promise<any> {
  return request.json().catch(() => ({}))
}
