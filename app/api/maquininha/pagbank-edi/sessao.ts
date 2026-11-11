import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Loja do lojista logado. A rota grava com service role (o token precisa ser
// cifrado no servidor), então a posse da loja é conferida AQUI, pela sessão.
export async function lojaDaSessao(): Promise<{ userId: string; lojaId: string } | null> {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } },
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: loja } = await supabase.from('lojas').select('id').eq('user_id', user.id).maybeSingle()
  if (!loja) return null
  return { userId: user.id, lojaId: String(loja.id) }
}
