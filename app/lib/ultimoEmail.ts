// Lembra (no próprio navegador) o último e-mail que pediu redefinição de senha.
//
// Serve para o "Reenviar link" de /nova-senha: quando o link expira não há
// sessão, então o app não teria como saber para quem reenviar e obrigaria o
// usuário a digitar o e-mail de novo. Se o pedido saiu deste mesmo navegador,
// reaproveitamos o valor e o reenvio fica em um clique.
//
// Só localStorage do próprio usuário, nada sensível (o e-mail dele mesmo).
// Em outro dispositivo simplesmente volta vazio e a página pede o e-mail.
// NÃO importe app/lib/email.ts aqui: aquele módulo é server-only (usa a
// RESEND_API_KEY) e este roda no cliente.

const CHAVE = 'commerly:ultimo-email-reset'

export function lembrarEmailReset(email: string): void {
  try { localStorage.setItem(CHAVE, email) } catch { /* modo privado/sem storage */ }
}

export function emailResetLembrado(): string {
  try { return localStorage.getItem(CHAVE) || '' } catch { return '' }
}
