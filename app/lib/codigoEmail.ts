// Pede o código de acesso por e-mail (cadastro com senha e login sem senha).
//
// Substitui `supabase.auth.signInWithOtp(...)` nas telas de login: o envio agora
// passa por /api/auth/enviar-codigo, que manda o código pelo Resend em vez do
// SMTP do Supabase. Mesmo formato de retorno ({ error }) para as telas não
// precisarem mudar a lógica — a verificação continua com
// `supabase.auth.verifyOtp({ email, token, type: 'email' })`.
export async function enviarCodigoEmail(email: string): Promise<{ error: Error | null }> {
  try {
    const res = await fetch('/api/auth/enviar-codigo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    if (res.ok) return { error: null }
    const corpo = (await res.json().catch(() => null)) as { erro?: string } | null
    return { error: new Error(corpo?.erro || `Falha ao enviar o código (${res.status})`) }
  } catch (e) {
    return { error: e instanceof Error ? e : new Error('Falha de rede ao enviar o código') }
  }
}
