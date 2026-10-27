// Aviso de transação do PagBank (API de Notificação v1), o caminho das vendas
// que a Commerly NÃO cria pela API — maquininha, link, etc.
//
// O PagBank manda um POST application/x-www-form-urlencoded com só
// `notificationCode` e `notificationType=transaction` para a URL cadastrada no
// painel (pagseguro.uol.com.br/preferencias/integracoes.jhtml). A venda em si
// vem da consulta GET /v3/transactions/notifications/{code}?email&token, que
// responde XML em ISO-8859-1.
// Docs: https://developer.pagbank.com.br/v1/docs/api-notificacao-v1
//
// Módulo puro (sem 'server-only' nem imports) para o teste em
// scripts/testes/pagbank-notificacao.test.mjs rodar direto no Node.

export type AvisoFormulario =
  | { ok: true; notificationCode: string; notificationType: string }
  | { ok: false; motivo: string }

export type TransacaoPagBank = {
  code: string
  status: number
  grossAmount: number
  paymentMethodType: number | null
  reference: string | null
  date: string | null
}

// 39 caracteres no formato XXXXXX-XXXXXXXXXXXX-XXXXXXXXXXXX-XXXXXX. A regex é
// um pouco mais larga que isso, mas só aceita o que é seguro em path de URL.
const NOTIFICATION_CODE_RE = /^[A-Z0-9-]{20,64}$/i

// Código da transação (vira pb_charge_id): UUID em maiúsculas no PagBank.
const TRANSACTION_CODE_RE = /^[A-Z0-9-]{8,80}$/i

/**
 * Lê o corpo como aviso de formulário. Devolve null quando o corpo NÃO é um
 * aviso de formulário (aí a rota segue para o caminho JSON da Orders API).
 */
export function lerAvisoFormulario(corpo: string, contentType: string): AvisoFormulario | null {
  const ehFormulario = /application\/x-www-form-urlencoded/i.test(contentType)
    || (!corpo.trimStart().startsWith('{') && /(^|&)notificationCode=/.test(corpo))
  if (!ehFormulario) return null

  const campos = new URLSearchParams(corpo)
  const notificationCode = (campos.get('notificationCode') ?? '').trim()
  const notificationType = (campos.get('notificationType') ?? '').trim()

  if (!notificationCode) return { ok: false, motivo: 'notificationCode ausente' }
  if (!NOTIFICATION_CODE_RE.test(notificationCode)) return { ok: false, motivo: 'notificationCode inválido' }
  return { ok: true, notificationCode, notificationType }
}

export function urlConsultaNotificacao(
  ambiente: 'sandbox' | 'producao',
  notificationCode: string,
  email: string,
  token: string,
): string {
  const base = ambiente === 'sandbox'
    ? 'https://ws.sandbox.pagseguro.uol.com.br'
    : 'https://ws.pagseguro.uol.com.br'
  const qs = new URLSearchParams({ email, token })
  return `${base}/v3/transactions/notifications/${encodeURIComponent(notificationCode)}?${qs}`
}

/** A resposta vem em ISO-8859-1; `res.text()` decodificaria como UTF-8. */
export function decodificarResposta(bytes: ArrayBuffer, contentType: string): string {
  const cabecalho = new TextDecoder('latin1').decode(bytes.slice(0, 100))
  const charset = /charset=([\w-]+)/i.exec(contentType)?.[1]
    ?? /encoding=["']([\w-]+)["']/i.exec(cabecalho)?.[1]
    ?? 'utf-8'
  const latin1 = /^(iso-8859-1|latin1|windows-1252)$/i.test(charset)
  return new TextDecoder(latin1 ? 'latin1' : 'utf-8').decode(bytes)
}

// ─── XML ─────────────────────────────────────────────────────────────────────
// Parser mínimo: só elementos e texto (ignora atributos, declaração,
// comentários). Basta para o XML de transação, que não usa nada além disso.

type NoXml = { nome: string; filhos: NoXml[]; texto: string }

function decodificarEntidades(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

function parseXml(xml: string): NoXml | null {
  const limpo = xml
    .replace(/<\?[\s\S]*?\?>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_, c: string) =>
      c.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'))

  const raiz: NoXml = { nome: '#raiz', filhos: [], texto: '' }
  const pilha: NoXml[] = [raiz]
  const tag = /<(\/?)([A-Za-z_][\w.:-]*)[^>]*?(\/?)>|([^<]+)/g

  let m: RegExpExecArray | null
  while ((m = tag.exec(limpo)) !== null) {
    const atual = pilha[pilha.length - 1]
    if (m[4] !== undefined) { atual.texto += m[4]; continue }
    const [, fecha, nome, autoFecha] = m
    if (fecha) {
      if (atual.nome !== nome) return null // XML malformado
      pilha.pop()
      continue
    }
    const no: NoXml = { nome, filhos: [], texto: '' }
    atual.filhos.push(no)
    if (!autoFecha) pilha.push(no)
  }
  if (pilha.length !== 1) return null
  return raiz.filhos[0] ?? null
}

function filho(no: NoXml | undefined, nome: string): NoXml | undefined {
  return no?.filhos.find(f => f.nome === nome)
}

function textoDe(no: NoXml | undefined): string | null {
  if (!no) return null
  const t = decodificarEntidades(no.texto).trim()
  return t === '' ? null : t
}

/**
 * Extrai os campos da transação. Lê só os filhos DIRETOS de <transaction>:
 * <paymentMethod> e <items> também têm <code>/<amount> e não podem vazar.
 * Devolve null se o XML não é uma transação utilizável.
 */
export function parseTransacaoPagBank(xml: string): TransacaoPagBank | null {
  const raiz = parseXml(xml)
  if (!raiz || raiz.nome !== 'transaction') return null

  const code = textoDe(filho(raiz, 'code'))
  const status = Number(textoDe(filho(raiz, 'status')))
  const grossAmount = Number(textoDe(filho(raiz, 'grossAmount')))
  if (!code || !TRANSACTION_CODE_RE.test(code)) return null
  if (!Number.isInteger(status)) return null
  if (!Number.isFinite(grossAmount) || grossAmount < 0) return null

  const tipo = Number(textoDe(filho(filho(raiz, 'paymentMethod'), 'type')))

  return {
    code,
    status,
    grossAmount,
    paymentMethodType: Number.isInteger(tipo) && tipo > 0 ? tipo : null,
    reference: textoDe(filho(raiz, 'reference')),
    date: textoDe(filho(raiz, 'date')),
  }
}

// ─── Status e forma de pagamento ─────────────────────────────────────────────
// Status: 1 Aguardando pagamento, 2 Em análise, 3 Paga, 4 Disponível,
// 5 Em disputa, 6 Devolvida, 7 Cancelada, 8 Debitado, 9 Retenção temporária.
// Só 3 e 4 viram venda; o 4 costuma chegar dias depois do 3 da MESMA
// transação, e o dedup por pb_charge_id evita gravar duas vezes.
export function statusGravaVenda(status: number): boolean {
  return status === 3 || status === 4
}

export function formaPagamentoPagBank(tipo: number | null): string {
  switch (tipo) {
    case 1: return 'Cartão de crédito'
    case 2: return 'Boleto'
    case 3: return 'Débito online'
    case 4: return 'Saldo PagBank'
    case 7: return 'Depósito em conta'
    default: return 'Maquininha'
  }
}
