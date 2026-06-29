// Helper de chamada ao Gemini com timeout + retry automático.
//
// As chamadas à API do Gemini falham de vez em quando na primeira tentativa
// (timeout/queda de rede ou 5xx transitório) e funcionam na segunda. Este
// helper centraliza a lógica de tentar de novo antes de devolver erro.

const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent'

export type GeminiResult =
  | { ok: true; data: any }
  | { ok: false; status: number; body: string }

type Opcoes = {
  /** Número máximo de tentativas (default 2). */
  tentativas?: number
  /** Timeout por tentativa, em ms (default 20s). */
  timeoutMs?: number
}

/**
 * Chama o Gemini e retenta automaticamente em falhas transitórias.
 * Retenta em: timeout/abort, erro de rede e status 5xx.
 * NÃO retenta em 4xx (inclui 429 — rate limit), pois retentar não ajuda.
 */
export async function chamarGemini(
  apiKey: string,
  payload: unknown,
  { tentativas = 2, timeoutMs = 20_000 }: Opcoes = {},
): Promise<GeminiResult> {
  let ultimoStatus = 0
  let ultimoBody = ''

  for (let i = 0; i < tentativas; i++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch(GEMINI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify(payload),
        signal: controller.signal,
      })
      clearTimeout(timer)

      if (res.ok) return { ok: true, data: await res.json() }

      ultimoStatus = res.status
      ultimoBody = await res.text().catch(() => '')
      // 4xx (incl. 429): erro do cliente — retentar não resolve.
      if (res.status < 500) return { ok: false, status: res.status, body: ultimoBody }
      // 5xx: transitório, cai no retry abaixo.
    } catch (e) {
      clearTimeout(timer)
      // timeout/abort ou erro de rede — transitório, retenta.
      ultimoStatus = 0
      ultimoBody = e instanceof Error ? e.message : String(e)
    }

    // Pequeno backoff entre tentativas (só se ainda houver outra).
    if (i < tentativas - 1) await new Promise(r => setTimeout(r, 400))
  }

  return { ok: false, status: ultimoStatus, body: ultimoBody }
}
