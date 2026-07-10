// Helper de chamada ao Gemini com timeout + retry automático.
//
// As chamadas à API do Gemini falham de vez em quando na primeira tentativa
// (timeout/queda de rede ou 5xx transitório) e funcionam na segunda. Este
// helper centraliza a lógica de tentar de novo antes de devolver erro.

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

/** Barato, para texto curto. */
export const MODELO_TEXTO = 'gemini-2.5-flash-lite'
/**
 * Tarefas com imagem (ler cardápio, identificar prato). O flash-lite erra
 * bastante em OCR de foto torta/amassada, que é o caso real aqui.
 *
 * Este modelo LÊ imagens e devolve texto — ele não gera nem edita imagem.
 * O realce de foto do produto é feito no cliente (lib/realceFoto.ts).
 */
export const MODELO_VISAO = 'gemini-2.5-flash'

export type GeminiResult =
  | { ok: true; data: any }
  | { ok: false; status: number; body: string }

type Opcoes = {
  /** Número máximo de tentativas (default 2). */
  tentativas?: number
  /** Timeout por tentativa, em ms (default 20s). */
  timeoutMs?: number
  /** Modelo a usar (default `MODELO_TEXTO`). */
  modelo?: string
}

/** Parte de imagem inline para o payload do Gemini. */
export function parteImagem(base64: string, mimeType: string) {
  return { inline_data: { mime_type: mimeType, data: base64 } }
}

export const MIMES_IMAGEM = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'] as const

/** Limite do inline_data do Gemini (~4MB de payload); deixamos folga. */
export const MAX_IMAGEM_BYTES = 3_500_000

/**
 * Chama o Gemini e retenta automaticamente em falhas transitórias.
 * Retenta em: timeout/abort, erro de rede e status 5xx.
 * NÃO retenta em 4xx (inclui 429 — rate limit), pois retentar não ajuda.
 */
export async function chamarGemini(
  apiKey: string,
  payload: unknown,
  { tentativas = 2, timeoutMs = 20_000, modelo = MODELO_TEXTO }: Opcoes = {},
): Promise<GeminiResult> {
  let ultimoStatus = 0
  let ultimoBody = ''
  const url = `${BASE}/${modelo}:generateContent`

  for (let i = 0; i < tentativas; i++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch(url, {
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

/** Texto da primeira candidata, ou string vazia. */
export function textoDaResposta(data: any): string {
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || ''
}

/**
 * Extrai o primeiro objeto/array JSON da resposta, tolerando cercas ```json.
 * Mesmo com `responseMimeType: application/json` o modelo às vezes cerca.
 */
export function extrairJSON<T = unknown>(texto: string): T | null {
  const limpo = texto.replace(/```json/gi, '').replace(/```/g, '').trim()
  for (const [abre, fecha] of [['{', '}'], ['[', ']']] as const) {
    const ini = limpo.indexOf(abre)
    const fim = limpo.lastIndexOf(fecha)
    if (ini >= 0 && fim > ini) {
      try { return JSON.parse(limpo.slice(ini, fim + 1)) as T } catch { /* tenta o outro */ }
    }
  }
  return null
}
