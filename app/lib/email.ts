// Envio de e-mails transacionais pelo Resend (HTTP direto, sem SDK).
//
// Por que não usamos o SMTP/templates do Supabase: o template padrão de reset
// usa `{{ .ConfirmationURL }}`, e vários clientes de e-mail (e scanners de
// link/antivírus) fazem um GET de pré-visualização nessa URL. Esse GET CONSOME
// o token de uso único — quando o usuário finalmente clica, o link já morreu
// ("link expirado"). Gerando o token nós mesmos (Admin API) e montando o link
// para /nova-senha?token_hash=..., o token só é consumido quando a PÁGINA
// chama verifyOtp — ou seja, por ação real do usuário, não por um GET cego.

const RESEND_ENDPOINT = 'https://api.resend.com/emails'

// O remetente precisa ser um endereço de um domínio VERIFICADO no Resend
// (Domains → Add domain → registrar os DNS). Sem isso a API responde 403.
function remetente(): string {
  return process.env.RESEND_FROM || 'Commerly <suporte@commerly.com.br>'
}

export type ResultadoEmail = { ok: true; id?: string } | { ok: false; erro: string }

export async function enviarEmail(opts: {
  para: string
  assunto: string
  html: string
  texto?: string
  /** Endereço para onde a resposta vai. Usado no contato do suporte: o e-mail
   *  sai do nosso remetente verificado, mas responder cai no usuário. */
  responderPara?: string
}): Promise<ResultadoEmail> {
  const key = process.env.RESEND_API_KEY
  if (!key) return { ok: false, erro: 'RESEND_API_KEY não configurada' }

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: remetente(),
        to: [opts.para],
        subject: opts.assunto,
        html: opts.html,
        ...(opts.texto ? { text: opts.texto } : {}),
        ...(opts.responderPara ? { reply_to: opts.responderPara } : {}),
      }),
    })

    const corpo = await res.json().catch(() => null) as { id?: string; message?: string } | null
    if (!res.ok) {
      return { ok: false, erro: corpo?.message || `Resend respondeu ${res.status}` }
    }
    return { ok: true, id: corpo?.id }
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : 'falha de rede' }
  }
}

// Template do e-mail de redefinição de senha. HTML com estilos inline porque
// clientes de e-mail (Gmail, Outlook) ignoram <style> e classes.
export function templateResetSenha(link: string): { html: string; texto: string } {
  const html = `<!doctype html>
<html lang="pt-BR">
<body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:16px;padding:32px;">
        <tr><td>
          <p style="margin:0 0 4px;color:#2563eb;font-size:13px;font-weight:600;">Commerly</p>
          <h1 style="margin:0 0 16px;color:#111827;font-size:22px;font-weight:700;">Redefinir sua senha</h1>
          <p style="margin:0 0 24px;color:#4b5563;font-size:15px;line-height:1.6;">
            Recebemos um pedido para redefinir a senha da sua conta. Clique no botão
            abaixo para criar uma nova senha. O link é válido por 1 hora.
          </p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
            <tr><td style="background:#2563eb;border-radius:12px;">
              <a href="${link}" style="display:inline-block;padding:14px 28px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;">Criar nova senha</a>
            </td></tr>
          </table>
          <p style="margin:0 0 24px;color:#6b7280;font-size:13px;line-height:1.6;">
            Se o botão não funcionar, copie e cole este endereço no navegador:<br>
            <span style="color:#2563eb;word-break:break-all;">${link}</span>
          </p>
          <p style="margin:0;padding-top:20px;border-top:1px solid #e5e7eb;color:#9ca3af;font-size:12px;line-height:1.6;">
            Se você não pediu para redefinir sua senha, ignore este e-mail — sua senha
            atual continua valendo.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`

  const texto = [
    'Redefinir sua senha — Commerly',
    '',
    'Recebemos um pedido para redefinir a senha da sua conta.',
    'Abra o endereço abaixo para criar uma nova senha (válido por 1 hora):',
    '',
    link,
    '',
    'Se você não pediu para redefinir sua senha, ignore este e-mail.',
  ].join('\n')

  return { html, texto }
}
