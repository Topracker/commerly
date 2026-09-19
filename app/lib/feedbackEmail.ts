// E-mail que avisa a equipe de um feedback novo do painel (/api/feedback).
// Separado da rota para dar para montar e inspecionar o payload sem disparar
// o Resend — e porque `route.ts` só pode exportar handlers.

import { enviarEmail, emailDaEquipe, escaparHtml } from './email'

/** Monta o e-mail para a equipe; a rota passa o resultado a `enviarEmail`. */
export function montarEmailFeedback(f: {
  tipo: string; mensagem: string; loja: string; emailDono: string; criadoEm: string
}): Parameters<typeof enviarEmail>[0] {
  // O banco grava `created_at` em UTC sem offset; o 'Z' é a verdade.
  const quando = new Date(/(Z|[+-]\d\d:?\d\d)$/.test(f.criadoEm) ? f.criadoEm : f.criadoEm + 'Z')
    .toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })

  const tipoSeguro = escaparHtml(f.tipo)
  const lojaSegura = escaparHtml(f.loja)
  const emailSeguro = escaparHtml(f.emailDono)
  // <br> depois de escapar: as quebras do usuário viram markup nosso, não dele.
  const mensagemHtml = escaparHtml(f.mensagem).replace(/\n/g, '<br>')

  const html = `<!doctype html>
<html lang="pt-BR">
<body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:24px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;padding:28px;">
        <tr><td>
          <p style="margin:0 0 4px;color:#2563eb;font-size:13px;font-weight:600;">Feedback do painel</p>
          <h1 style="margin:0 0 20px;color:#111827;font-size:20px;font-weight:700;">${tipoSeguro} — ${lojaSegura}</h1>
          <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 20px;font-size:14px;color:#4b5563;">
            <tr><td style="padding:4px 0;width:70px;color:#9ca3af;">Tipo</td><td style="padding:4px 0;">${tipoSeguro}</td></tr>
            <tr><td style="padding:4px 0;color:#9ca3af;">Loja</td><td style="padding:4px 0;">${lojaSegura}</td></tr>
            <tr><td style="padding:4px 0;color:#9ca3af;">Dono</td><td style="padding:4px 0;"><a href="mailto:${emailSeguro}" style="color:#2563eb;">${emailSeguro}</a></td></tr>
            <tr><td style="padding:4px 0;color:#9ca3af;">Data</td><td style="padding:4px 0;">${quando}</td></tr>
          </table>
          <div style="padding:16px;background:#f9fafb;border-radius:12px;color:#111827;font-size:15px;line-height:1.6;">${mensagemHtml}</div>
          <p style="margin:20px 0 0;padding-top:16px;border-top:1px solid #e5e7eb;color:#9ca3af;font-size:12px;">
            Responda a este e-mail para falar direto com o dono da loja.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`

  const texto = [
    `Feedback do painel — ${f.tipo}`,
    '',
    `Tipo:  ${f.tipo}`,
    `Loja:  ${f.loja}`,
    `Dono:  ${f.emailDono}`,
    `Data:  ${quando}`,
    '',
    f.mensagem,
    '',
    'Responda a este e-mail para falar direto com o dono da loja.',
  ].join('\n')

  return {
    para: emailDaEquipe(),
    assunto: `[Feedback / ${f.tipo}] ${f.loja}`,
    html,
    texto,
    ...(f.emailDono ? { responderPara: f.emailDono } : {}),
  }
}
