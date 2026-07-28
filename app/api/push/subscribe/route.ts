import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '../../../lib/supabase-admin'
import { rateLimit } from '../../../lib/rate-limit'
import { enviarPushParaUsuario } from '../../../lib/push'

// Salva (ou reativa) a push subscription do dispositivo do usuário logado.
// Dedup por endpoint (unique): se o mesmo navegador reinscrever, atualiza as
// chaves e reassocia ao user atual. Roda com service role para o upsert.
export async function POST(request: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } },
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (!rateLimit(`push-subscribe:${user.id}`, 30, 60_000)) {
    return NextResponse.json({ error: 'Muitas tentativas. Aguarde.' }, { status: 429 })
  }

  const body = await request.json().catch(() => ({}))
  const sub = body?.subscription
  const endpoint: string | undefined = sub?.endpoint
  const p256dh: string | undefined = sub?.keys?.p256dh
  const auth: string | undefined = sub?.keys?.auth
  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: 'Subscription inválida' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Colunas ESSENCIAIS: sem elas não há como enviar push nenhum.
  const essenciais = { user_id: user.id, endpoint, p256dh, auth }
  // Colunas OPCIONAIS: só diagnóstico. Nunca podem custar a inscrição.
  const opcionais = { user_agent: request.headers.get('user-agent')?.slice(0, 300) || null }

  const gravar = (linha: Record<string, unknown>) =>
    admin.from('push_subscriptions').upsert(linha, { onConflict: 'endpoint' })

  let { error } = await gravar({ ...essenciais, ...opcionais })

  // Divergência de schema (PGRST204 = coluna inexistente no cache do PostgREST)
  // derrubava a inscrição inteira: a tabela em produção ficou sem `user_agent`
  // porque o `create table if not exists` da migração original pulou o bloco,
  // e TODA inscrição vinha morrendo em 500 — em silêncio, porque o cliente
  // engolia o erro. Diagnóstico não pode derrubar a função: retenta só com o
  // essencial e deixa o aviso no log para a coluna ser criada depois.
  if (error && (error.code === 'PGRST204' || /column/i.test(error.message))) {
    console.warn('[push-subscribe] coluna opcional ausente, salvando sem ela:', error.message)
    ;({ error } = await gravar(essenciais))
  }

  if (error) {
    console.error('[push-subscribe] erro:', error.code, error.message)
    return NextResponse.json({ error: 'Não foi possível salvar a inscrição.' }, { status: 500 })
  }

  // ── Boas-vindas ────────────────────────────────────────────────────────────
  // Primeira vez que este usuário registra um dispositivo: manda um push de
  // boas-vindas. Serve de confirmação visível de que a permissão pegou — sem
  // ele, o usuário concede a permissão e não acontece nada, e só descobre se
  // funcionou no primeiro pedido de verdade.
  //
  // A idempotência é pela PRÓPRIA notificação, não por contagem de inscrições:
  // quem instala num segundo aparelho não deve receber de novo, e a contagem
  // teria corrida entre duas abas. Falhar aqui não invalida a inscrição, que é
  // o que a rota veio fazer — daí o try/catch.
  let boasVindas = false
  try {
    const { data: jaTem } = await admin
      .from('notificacoes').select('id')
      .eq('user_id', user.id).eq('tipo', 'boas_vindas').maybeSingle()

    if (!jaTem) {
      await admin.from('notificacoes').insert({
        user_id: user.id,
        tipo: 'boas_vindas',
        titulo: 'Notificações ativadas 🎉',
        mensagem: 'Pronto! Avisamos você aqui sobre pedidos, entregas e conquistas.',
        link: '/notificacoes',
        dados: {},
      })
      await enviarPushParaUsuario(admin, user.id, {
        titulo: 'Bem-vindo à Commerly 🎉',
        mensagem: 'Notificações ativadas. Você não perde mais nenhum pedido.',
        link: '/notificacoes',
        tipo: 'boas_vindas',
        tag: 'boas_vindas',
      })
      boasVindas = true
    }
  } catch (e) {
    console.warn('[push-subscribe] boas-vindas falhou:', e)
  }

  return NextResponse.json({ ok: true, boasVindas })
}
