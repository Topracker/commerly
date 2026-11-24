import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { enviarEmail, emailDaEquipe, escaparHtml as escapar } from '../../lib/email'
import { rateLimit } from '../../lib/rate-limit'
import { MOTIVOS_DENUNCIA } from '../../lib/moderacao'

// Denúncia de conteúdo ou usuário (posts, stories, comentários, mensagens,
// lojas, clientes). Exigência da política de UGC da Google Play: todo app com
// conteúdo de usuários precisa de um jeito de denunciar dentro do app.
// Só usuário logado denuncia; a denúncia vai por e-mail para a equipe.

const TIPOS = ['post', 'story', 'comentario', 'loja', 'cliente', 'mensagem'] as const

export async function POST(req: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } },
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ erro: 'Entre na sua conta para denunciar.' }, { status: 401 })
  if (!rateLimit(`denunciar:${user.id}`, 10, 600_000)) {
    return NextResponse.json({ erro: 'Muitas denúncias seguidas. Aguarde alguns minutos.' }, { status: 429 })
  }

  const b = await req.json().catch(() => null)
  const tipo = TIPOS.find(t => t === b?.tipo)
  const alvoId = typeof b?.alvoId === 'string' ? b.alvoId.slice(0, 80) : ''
  const motivo = MOTIVOS_DENUNCIA.find(m => m === b?.motivo)
  const detalhe = typeof b?.detalhe === 'string' ? b.detalhe.trim().slice(0, 1000) : ''
  const alvoNome = typeof b?.alvoNome === 'string' ? b.alvoNome.slice(0, 120) : ''
  const trecho = typeof b?.trecho === 'string' ? b.trecho.slice(0, 1000) : ''
  const pagina = typeof b?.pagina === 'string' ? b.pagina.slice(0, 200) : ''
  if (!tipo || !alvoId || !motivo) {
    return NextResponse.json({ erro: 'Escolha o motivo da denúncia.' }, { status: 400 })
  }

  const linhas: [string, string][] = [
    ['Tipo', tipo],
    ['Alvo', `${alvoNome ? alvoNome + ' — ' : ''}${alvoId}`],
    ['Motivo', motivo],
    ['Denunciante', `${user.email || '(sem e-mail)'} — ${user.id}`],
    ['Página', pagina || '-'],
  ]
  const html = `<!doctype html><html lang="pt-BR"><body style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#f4f5f7;padding:24px">
<div style="max-width:560px;margin:auto;background:#fff;border-radius:16px;padding:24px">
<p style="margin:0 0 4px;color:#dc2626;font-size:13px;font-weight:600">Denúncia no app</p>
<h1 style="margin:0 0 16px;font-size:20px;color:#111827">${escapar(motivo)}</h1>
<table style="font-size:14px;color:#374151;border-collapse:collapse">${linhas.map(([k, v]) =>
    `<tr><td style="padding:4px 12px 4px 0;color:#9ca3af">${k}</td><td style="padding:4px 0">${escapar(v)}</td></tr>`).join('')}</table>
${trecho ? `<p style="margin:16px 0 4px;color:#9ca3af;font-size:13px">Conteúdo denunciado</p><div style="padding:12px;background:#f9fafb;border-radius:10px;white-space:pre-wrap">${escapar(trecho)}</div>` : ''}
${detalhe ? `<p style="margin:16px 0 4px;color:#9ca3af;font-size:13px">Comentário de quem denunciou</p><div style="padding:12px;background:#f9fafb;border-radius:10px;white-space:pre-wrap">${escapar(detalhe)}</div>` : ''}
<p style="margin:20px 0 0;color:#9ca3af;font-size:12px">Prazo da política da Play: avaliar e agir em tempo hábil. Remova o conteúdo ou suspenda a conta pelo painel admin se for o caso.</p>
</div></body></html>`

  const r = await enviarEmail({
    para: emailDaEquipe(),
    assunto: `[Denúncia] ${motivo} — ${tipo}`,
    html,
    texto: linhas.map(([k, v]) => `${k}: ${v}`).join('\n') + (trecho ? `\n\nConteúdo: ${trecho}` : '') + (detalhe ? `\n\nDetalhe: ${detalhe}` : ''),
    responderPara: user.email || undefined,
  })
  if (!r.ok) {
    console.error('[denunciar] falha ao enviar e-mail:', r.erro)
    return NextResponse.json({ erro: 'Não foi possível enviar agora. Tente de novo em instantes.' }, { status: 502 })
  }
  return NextResponse.json({ ok: true })
}
