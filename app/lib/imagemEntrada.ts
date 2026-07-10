// Validação da imagem que o usuário manda para as rotas de visão (#1, #2).
//
// A imagem chega como data URL do input do navegador. Nunca confie no
// `mime_type` declarado pelo cliente: conferimos a assinatura dos primeiros
// bytes antes de repassar ao Gemini.

import { MAX_IMAGEM_BYTES } from './gemini'

export type ImagemValidada = { base64: string; mimeType: string }

const ASSINATURAS: { mime: string; bytes: number[]; offset: number }[] = [
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff], offset: 0 },
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47], offset: 0 },
  // WEBP: "RIFF" .... "WEBP"
  { mime: 'image/webp', bytes: [0x52, 0x49, 0x46, 0x46], offset: 0 },
]

function detectarMime(buf: Buffer): string | null {
  for (const a of ASSINATURAS) {
    const trecho = buf.subarray(a.offset, a.offset + a.bytes.length)
    if (trecho.length === a.bytes.length && a.bytes.every((b, i) => trecho[i] === b)) {
      if (a.mime === 'image/webp' && buf.subarray(8, 12).toString('ascii') !== 'WEBP') continue
      return a.mime
    }
  }
  return null
}

/**
 * Aceita uma data URL (`data:image/jpeg;base64,...`) ou base64 puro.
 * Devolve o base64 limpo e o mime detectado pelos bytes reais.
 */
export function validarImagem(entrada: unknown): ImagemValidada | { erro: string } {
  if (typeof entrada !== 'string' || !entrada) return { erro: 'Envie uma imagem.' }

  const base64 = entrada.startsWith('data:')
    ? entrada.slice(entrada.indexOf(',') + 1)
    : entrada

  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64.slice(0, 128))) {
    return { erro: 'Imagem inválida.' }
  }

  let buf: Buffer
  try { buf = Buffer.from(base64, 'base64') } catch { return { erro: 'Imagem inválida.' } }

  if (buf.length === 0) return { erro: 'Imagem vazia.' }
  if (buf.length > MAX_IMAGEM_BYTES) {
    return { erro: `Imagem muito grande (máx ${Math.floor(MAX_IMAGEM_BYTES / 1_000_000)} MB). Tire a foto com menos resolução.` }
  }

  const mimeType = detectarMime(buf)
  if (!mimeType) return { erro: 'Formato não suportado. Use JPG, PNG ou WEBP.' }

  return { base64, mimeType }
}
