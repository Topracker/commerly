import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { rateLimit } from '../../../lib/rate-limit'

// Verificação do token de recuperação NO SERVIDOR.
//
// Motivo: quando o verifyOtp roda no navegador, o erro do GoTrue só existe no
// console do cliente — e com o DevTools bloqueado não dá para ler. Aqui a
// chamada acontece no servidor, então o erro CRU aparece nos logs da Vercel
// (`vercel logs --environment production -x`) e volta inteiro para a página.
//
// O verifyOtp CONSOME o token, então esta rota é o único lugar que o verifica:
// se a página também verificasse, a segunda chamada falharia como "expirado" e
// mascararia o problema real. Como o token é consumido aqui, devolvemos os
// tokens da sessão para a página aplicar com setSession() — sem isso o
// updateUser({password}) do navegador não teria sessão de recuperação.
//
// Nada de máscara: o objetivo desta rota é justamente expor o erro exato
// (otp_expired, invalid, etc.). Ela não vaza nada sensível — o GoTrue já
// devolve mensagens genéricas para recovery, e quem chama já tem o token.

type ErroBruto = {
  message: string
  status: number | null
  code: string | null
  name: string | null
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const tokenHash = typeof body?.token_hash === 'string' ? body.token_hash : ''
  const type = typeof body?.type === 'string' && body.type ? body.type : 'recovery'

  if (!tokenHash) {
    return NextResponse.json(
      { ok: false, erro: { message: 'token_hash ausente na requisição', status: 400, code: 'sem_token', name: null } },
      { status: 400 },
    )
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'sem-ip'
  if (!rateLimit(`verificar-recovery:${ip}`, 20, 600_000)) {
    return NextResponse.json(
      { ok: false, erro: { message: 'Muitas tentativas. Aguarde alguns minutos.', status: 429, code: 'rate_limited', name: null } },
      { status: 429 },
    )
  }

  // Chave ANÔNIMA de propósito: verifyOtp é operação de usuário, não de admin.
  // Com a service role o GoTrue nem aceitaria a troca por sessão.
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  // Prefixo curto + tamanho para casar esta tentativa com o "link montado" de
  // /api/auth/recuperar. NUNCA o token inteiro: ele troca a senha da conta.
  const marca = `${tokenHash.slice(0, 6)}… (len=${tokenHash.length})`

  const { data, error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: type as 'recovery',
  })

  if (error) {
    const bruto: ErroBruto = {
      message: error.message,
      status: (error as { status?: number }).status ?? null,
      code: (error as { code?: string }).code ?? null,
      name: error.name ?? null,
    }
    console.error('[api/auth/verificar-recovery] verifyOtp FALHOU',
      JSON.stringify({ token: marca, type, ...bruto }))
    // 200 de propósito: a página precisa ler o corpo para exibir o erro cru,
    // e um status de erro faria o fetch cair no caminho genérico de rede.
    return NextResponse.json({ ok: false, erro: bruto })
  }

  const session = data?.session
  if (!session) {
    console.error('[api/auth/verificar-recovery] verifyOtp OK mas SEM sessão',
      JSON.stringify({ token: marca, type, user: data?.user?.id ?? null }))
    return NextResponse.json({
      ok: false,
      erro: { message: 'verifyOtp não retornou sessão (sem erro do GoTrue)', status: null, code: 'sem_sessao', name: null },
    })
  }

  console.log('[api/auth/verificar-recovery] verifyOtp OK',
    JSON.stringify({ token: marca, type, user: data.user?.id, email: data.user?.email }))

  return NextResponse.json({
    ok: true,
    session: { access_token: session.access_token, refresh_token: session.refresh_token },
    email: data.user?.email ?? null,
  })
}
