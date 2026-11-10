// Cifra do token EDI do PagBank (AES-256-GCM). SÓ no servidor.
//
// A chave vem da env PAGBANK_EDI_CHAVE (32 bytes em base64) e nunca vai ao
// banco. O loja_id entra como AAD: o texto cifrado de uma loja copiado para a
// linha de outra não decifra.
//
// Formato gravado: "v1:<iv b64>:<tag b64>:<cifrado b64>".
// Trocar a chave invalida os tokens salvos: o lojista cadastra de novo.
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

export class ChaveEdiAusente extends Error {
  constructor() { super('PAGBANK_EDI_CHAVE ausente ou inválida') }
}

function chave(): Buffer {
  const b64 = process.env.PAGBANK_EDI_CHAVE ?? ''
  const k = Buffer.from(b64, 'base64')
  if (k.length !== 32) throw new ChaveEdiAusente()
  return k
}

export function cifraDisponivel(): boolean {
  try { chave(); return true } catch { return false }
}

export function cifrarToken(token: string, lojaId: string): string {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', chave(), iv)
  c.setAAD(Buffer.from(lojaId, 'utf8'))
  const cifrado = Buffer.concat([c.update(token, 'utf8'), c.final()])
  return ['v1', iv.toString('base64'), c.getAuthTag().toString('base64'), cifrado.toString('base64')].join(':')
}

export function decifrarToken(gravado: string, lojaId: string): string {
  const [v, iv, tag, cifrado] = gravado.split(':')
  if (v !== 'v1' || !iv || !tag || !cifrado) throw new Error('token cifrado em formato desconhecido')
  const d = createDecipheriv('aes-256-gcm', chave(), Buffer.from(iv, 'base64'))
  d.setAAD(Buffer.from(lojaId, 'utf8'))
  d.setAuthTag(Buffer.from(tag, 'base64'))
  return Buffer.concat([d.update(Buffer.from(cifrado, 'base64')), d.final()]).toString('utf8')
}

/** "••••7741": só os 4 últimos, para a tela. */
export function finalDoToken(token: string): string {
  return token.slice(-4)
}
