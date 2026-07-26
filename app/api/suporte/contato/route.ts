import { NextRequest, NextResponse } from 'next/server'
import { enviarEmail } from '../../../lib/email'
import { rateLimit } from '../../../lib/rate-limit'

// Formulário de contato do /suporte. O e-mail sai pelo Resend a partir do
// nosso remetente verificado (só ele passa no SPF/DKIM do domínio) e o
// endereço de quem escreveu vai no reply_to — assim, responder no cliente de
// e-mail cai direto na caixa do usuário, sem copiar e colar endereço.

const DESTINO = 'suportecommerly@gmail.com'

const ASSUNTOS = ['Dúvida', 'Problema técnico', 'Financeiro', 'Sugestão', 'Outro'] as const
type Assunto = (typeof ASSUNTOS)[number]

const LIMITES = { nome: 100, email: 254, mensagem: 5000 }

// Escapa o que o usuário escreveu antes de interpolar no HTML do e-mail. Sem
// isso, uma mensagem com "<img onerror=...>" viraria markup no cliente de
// e-mail de quem lê — o formulário é público, então trate tudo como hostil.
function escapar(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const nome = typeof body?.nome === 'string' ? body.nome.trim() : ''
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  const assunto = typeof body?.assunto === 'string' ? body.assunto.trim() : ''
  const mensagem = typeof body?.mensagem === 'string' ? body.mensagem.trim() : ''

  if (nome.length < 2 || nome.length > LIMITES.nome) {
    return NextResponse.json({ erro: 'Informe seu nome.' }, { status: 400 })
  }
  if (!email || email.length > LIMITES.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ erro: 'Informe um e-mail válido.' }, { status: 400 })
  }
  if (!ASSUNTOS.includes(assunto as Assunto)) {
    return NextResponse.json({ erro: 'Escolha um assunto.' }, { status: 400 })
  }
  if (mensagem.length < 10) {
    return NextResponse.json({ erro: 'Escreva sua mensagem com pelo menos 10 caracteres.' }, { status: 400 })
  }
  if (mensagem.length > LIMITES.mensagem) {
    return NextResponse.json({ erro: 'Mensagem muito longa (máximo 5000 caracteres).' }, { status: 400 })
  }

  // Rota pública e sem login: limita por IP (5/10min) e por e-mail informado
  // (3/10min) para não virar máquina de spam nem queimar cota do Resend.
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'sem-ip'
  if (!rateLimit(`suporte-ip:${ip}`, 5, 600_000) || !rateLimit(`suporte-email:${email}`, 3, 600_000)) {
    return NextResponse.json(
      { erro: 'Muitas mensagens enviadas. Aguarde alguns minutos e tente novamente.' },
      { status: 429 },
    )
  }

  const nomeSeguro = escapar(nome)
  const emailSeguro = escapar(email)
  const assuntoSeguro = escapar(assunto)
  // <br> depois de escapar: as quebras do usuário viram markup nosso, não dele.
  const mensagemHtml = escapar(mensagem).replace(/\n/g, '<br>')

  const html = `<!doctype html>
<html lang="pt-BR">
<body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:24px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;padding:28px;">
        <tr><td>
          <p style="margin:0 0 4px;color:#2563eb;font-size:13px;font-weight:600;">Contato pelo site</p>
          <h1 style="margin:0 0 20px;color:#111827;font-size:20px;font-weight:700;">${assuntoSeguro}</h1>
          <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 20px;font-size:14px;color:#4b5563;">
            <tr><td style="padding:4px 0;width:70px;color:#9ca3af;">Nome</td><td style="padding:4px 0;">${nomeSeguro}</td></tr>
            <tr><td style="padding:4px 0;color:#9ca3af;">E-mail</td><td style="padding:4px 0;"><a href="mailto:${emailSeguro}" style="color:#2563eb;">${emailSeguro}</a></td></tr>
          </table>
          <div style="padding:16px;background:#f9fafb;border-radius:12px;color:#111827;font-size:15px;line-height:1.6;">${mensagemHtml}</div>
          <p style="margin:20px 0 0;padding-top:16px;border-top:1px solid #e5e7eb;color:#9ca3af;font-size:12px;">
            Responda a este e-mail para falar direto com ${nomeSeguro}.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`

  const texto = [
    `Contato pelo site — ${assunto}`,
    '',
    `Nome:   ${nome}`,
    `E-mail: ${email}`,
    '',
    mensagem,
    '',
    'Responda a este e-mail para falar direto com quem escreveu.',
  ].join('\n')

  const envio = await enviarEmail({
    para: DESTINO,
    assunto: `[Suporte / ${assunto}] ${nome}`,
    html,
    texto,
    responderPara: email,
  })

  if (!envio.ok) {
    // Aqui o erro é NOSSO (chave, domínio, cota). Diferente do reset de senha,
    // não há motivo para esconder a falha: se a mensagem não saiu, o usuário
    // precisa saber para procurar o e-mail direto em vez de esperar resposta.
    console.error('[api/suporte/contato] Resend falhou:', envio.erro)
    return NextResponse.json(
      { erro: 'Não foi possível enviar sua mensagem agora. Escreva para suporte@commerly.com.br.' },
      { status: 502 },
    )
  }

  console.log('[api/suporte/contato] enviado — id:', envio.id, '| assunto:', assunto)
  return NextResponse.json({ ok: true })
}
