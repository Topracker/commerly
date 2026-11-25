// Verificação de idade por documento (Didit). Só roda no servidor.
// Fluxo: /api/idade/iniciar cria a sessão -> o cliente envia documento + selfie
// na página da Didit -> a Didit chama /api/webhooks/didit -> marcamos a conta com
// app_metadata.idade_verificada (ver app/lib/restritos.ts).
//
// Variáveis de ambiente (Vercel):
//   DIDIT_API_KEY         chave sk_live_... da aplicação
//   DIDIT_WORKFLOW_ID     fluxo "Verificação de idade" publicado
//   DIDIT_WEBHOOK_SECRET  segredo do endpoint de webhook

import crypto from 'crypto'

const BASE = 'https://verification.didit.me'

export function diditConfigurado(): boolean {
  return !!(process.env.DIDIT_API_KEY && process.env.DIDIT_WORKFLOW_ID && process.env.DIDIT_WEBHOOK_SECRET)
}

export async function criarSessaoDidit(vendorData: string, callback: string): Promise<{ url: string; sessionId: string } | { erro: string }> {
  try {
    const res = await fetch(`${BASE}/v3/session/`, {
      method: 'POST',
      headers: { 'x-api-key': process.env.DIDIT_API_KEY!, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workflow_id: process.env.DIDIT_WORKFLOW_ID,
        vendor_data: vendorData,
        callback,
        language: 'pt',
      }),
    })
    const d = await res.json().catch(() => ({}))
    if (!res.ok || !d?.url) {
      console.error('[didit] criar sessão falhou', res.status, JSON.stringify(d).slice(0, 300))
      return { erro: 'Não foi possível iniciar a verificação agora. Tente novamente em instantes.' }
    }
    return { url: String(d.url), sessionId: String(d.session_id || '') }
  } catch (e) {
    console.error('[didit] erro de rede', e)
    return { erro: 'Não foi possível iniciar a verificação agora. Tente novamente em instantes.' }
  }
}

// ---- Assinatura do webhook (X-Signature-V2: HMAC-SHA256 do JSON canônico) ----

function ordenarChaves(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(ordenarChaves)
  if (v !== null && typeof v === 'object') {
    return Object.keys(v as Record<string, unknown>).sort().reduce<Record<string, unknown>>((acc, k) => {
      acc[k] = ordenarChaves((v as Record<string, unknown>)[k])
      return acc
    }, {})
  }
  return v
}

function hmacHex(secret: string, dados: string): string {
  return crypto.createHmac('sha256', secret).update(dados, 'utf8').digest('hex')
}

function iguais(a: string, b: string): boolean {
  const x = Buffer.from(a, 'utf8')
  const y = Buffer.from(b, 'utf8')
  return x.length === y.length && crypto.timingSafeEqual(x, y)
}

/** Confere frescor (5 min) e assinatura (V2 ou bruta). */
export function webhookValido(corpoBruto: string, h: Headers, segredo: string): boolean {
  let ts = Number.parseInt(h.get('x-timestamp') || '', 10)
  if (!Number.isFinite(ts)) {
    try { ts = Number(JSON.parse(corpoBruto).timestamp) } catch { ts = NaN }
  }
  if (!Number.isFinite(ts) || Math.abs(Math.floor(Date.now() / 1000) - ts) > 300) return false
  const v2 = h.get('x-signature-v2')
  const bruta = h.get('x-signature')
  if (v2) {
    try {
      const canonico = JSON.stringify(ordenarChaves(JSON.parse(corpoBruto)))
      if (iguais(hmacHex(segredo, canonico), v2)) return true
    } catch { /* corpo inválido */ }
  }
  if (bruta && iguais(hmacHex(segredo, corpoBruto), bruta)) return true
  return false
}
