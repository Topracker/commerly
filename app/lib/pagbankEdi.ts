// Maquininha PagBank automática: leitura da API do Extrato EDI (v3.00).
// Doc: https://developer.pagbank.com.br/docs/api-do-extrato-edi
//
// Sem dependências de propósito, para rodar direto no Node
// (scripts/testes/pagbank-edi.test.mjs). A orquestração (banco, cifra) fica em
// pagbankEdiSync.ts.
//
// O que a doc garante (conferido em 2026-11-10):
//   GET https://edi.api.pagbank.com.br/movement/v3.00/transactional/AAAA-MM-DD
//       ?pageNumber=N&pageSize=1000   — Basic Auth estabelecimento:token
//   Um dia por chamada; header VALIDADO = TRUE quando o dia fechou (D+1).
//   Corpo: { detalhes: [...], pagination: { totalPages, page, totalElements } }
//
// O que vem dos CENÁRIOS DE TESTE da doc (não de uma tabela oficial de
// códigos — ela não está publicada):
//   - Venda parcelada vem em N linhas com o MESMO codigo_transacao, uma por
//     parcela, e valor_total/valor_original/valor_liquido repetidos (são da
//     transação inteira). Conta uma vez só.
//   - valor_original_transacao é o que o lojista vendeu; valor_total inclui o
//     juro do parcelamento pago pelo comprador (cenário 7: 134,87 × 100,00).
//   - tipo_evento 1 = venda; 6 = cancelamento (total ou parcial, com o valor
//     cancelado em valor_original); 5 = chargeback. O resto (ajustes, disputa,
//     bloqueio, saldo) não é venda e fica de fora.
//   - canal_entrada 'W' + meio_captura '3' = online; numero_serie_leitor
//     preenchido = maquininha física.
//   - arranjo_ur 'CREDIT_VISA', 'DEBIT_MASTER', 'PIX'… dá forma e bandeira.

export const EDI_BASE = 'https://edi.api.pagbank.com.br'
export const EDI_VERSAO = 'v3.00'
export const EDI_PAGE_SIZE = 1000
/** Teto de páginas por dia: 50 mil transações num dia não é pequeno comércio. */
export const EDI_MAX_PAGINAS = 50
/** Na primeira sincronização, quantos dias para trás buscar. */
export const EDI_DIAS_INICIAIS = 30
/** Máximo de dias por passada (o resto fica para a próxima). */
export const EDI_MAX_DIAS_POR_PASSADA = 31
/** Intervalo mínimo entre dois "Sincronizar agora". */
export const EDI_INTERVALO_MANUAL_MS = 10 * 60_000

export const ADQUIRENTE_EDI = 'pagbank'
export const ORIGEM_EDI = 'maquininha_pagbank'

/** Linha de `detalhes`. Todos os campos podem faltar ou vir como texto. */
export type DetalheEdi = {
  movimento_api_codigo?: string | null
  estabelecimento?: string | null
  data_inicial_transacao?: string | null
  hora_inicial_transacao?: string | null
  tipo_evento?: string | number | null
  tipo_transacao?: string | number | null
  codigo_transacao?: string | null
  valor_total_transacao?: number | string | null
  valor_parcela?: number | string | null
  parcela?: string | number | null
  quantidade_parcelas?: string | number | null
  valor_original_transacao?: number | string | null
  taxa_intermediacao?: number | string | null
  tarifa_intermediacao?: number | string | null
  valor_liquido_transacao?: number | string | null
  status_pagamento?: string | number | null
  meio_pagamento?: string | number | null
  canal_entrada?: string | null
  leitor?: string | null
  meio_captura?: string | number | null
  numero_serie_leitor?: string | null
  arranjo_ur?: string | null
}

export type Captura = 'maquininha' | 'online'

export type VendaEdi = {
  id: string
  data: string // ISO em UTC
  bruto: number
  taxa: number | null
  liquido: number | null
  bandeira: string | null
  forma: string
  captura: Captura | null
  parcelas: number
}

/** Cancelamento ou chargeback de uma venda que NÃO está neste dia. */
export type AjusteEdi = { id: string; bruto: number; liquido: number | null }

export type MovimentoInterpretado = {
  vendas: VendaEdi[]
  /** Cancelamentos/chargebacks de vendas de outros dias, para abater no banco. */
  ajustes: AjusteEdi[]
  /** Vendas do dia canceladas por inteiro no mesmo dia. */
  canceladas: number
  /** Linhas a mais de venda parcelada (não viram venda nova). */
  parcelasAgrupadas: number
  /** Eventos que não são venda nem cancelamento (ajuste, saldo, disputa…). */
  outrosEventos: number
  /** Linha de venda sem código ou sem valor. */
  invalidas: number
  linhas: number
}

const arred = (n: number) => Math.round(n * 100) / 100

function num(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v !== 'string' || v.trim() === '') return null
  const s = v.trim()
  // A API manda número JSON; texto "1.234,56" só por garantia.
  const n = Number(/,\d{1,2}$/.test(s) ? s.replace(/\./g, '').replace(',', '.') : s)
  return Number.isFinite(n) ? n : null
}

/** Código numérico do EDI sem zeros à esquerda: "01" → "1". */
function cod(v: unknown): string {
  const s = String(v ?? '').trim()
  return /^\d+$/.test(s) ? String(Number(s)) : s.toUpperCase()
}

function texto(v: unknown): string {
  return String(v ?? '').trim()
}

export const EVENTO_VENDA = '1'
export const EVENTOS_DESFAZ = new Set(['5', '6']) // chargeback, cancelamento

/** Instante UTC de um horário de relógio em São Paulo. */
export function deSaoPaulo(a: number, m: number, d: number, h: number, mi: number, s: number): Date {
  const palpite = Date.UTC(a, m - 1, d, h, mi, s)
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(palpite))
  const n = (t: string) => Number(p.find(x => x.type === t)?.value)
  const relogio = Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'), n('second'))
  return new Date(palpite - (relogio - palpite))
}

/** Dia de hoje (YYYY-MM-DD) no fuso da loja. */
export function hojeSP(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(agora)
}

export function somarDiasIso(dia: string, n: number): string {
  const [a, m, d] = dia.split('-').map(Number)
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10)
}

/**
 * Dias a buscar nesta passada, em ordem: do dia seguinte ao último validado até
 * ontem. Sem histórico, começa EDI_DIAS_INICIAIS dias para trás. Hoje nunca
 * entra: o PagBank só fecha o dia em D+1.
 */
export function diasPendentes(ultimoValidado: string | null, agora: Date = new Date()): string[] {
  const ontem = somarDiasIso(hojeSP(agora), -1)
  const limiteAntigo = somarDiasIso(ontem, -(EDI_DIAS_INICIAIS - 1))
  let inicio = ultimoValidado ? somarDiasIso(ultimoValidado, 1) : limiteAntigo
  if (inicio < limiteAntigo) inicio = limiteAntigo
  const dias: string[] = []
  for (let d = inicio; d <= ontem && dias.length < EDI_MAX_DIAS_POR_PASSADA; d = somarDiasIso(d, 1)) dias.push(d)
  return dias
}

function dataDaLinha(l: DetalheEdi, dia: string): string {
  const d = texto(l.data_inicial_transacao).match(/^(\d{4})-(\d{2})-(\d{2})/)
  const h = texto(l.hora_inicial_transacao).match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/)
  const [a, m, dd] = d ? [Number(d[1]), Number(d[2]), Number(d[3])] : dia.split('-').map(Number)
  const dt = h
    ? deSaoPaulo(a, m, dd, Number(h[1]), Number(h[2]), Number(h[3] ?? 0))
    : deSaoPaulo(a, m, dd, 12, 0, 0)
  return dt.toISOString()
}

const BANDEIRAS: Record<string, string> = {
  VISA: 'Visa', MASTER: 'Mastercard', MASTERCARD: 'Mastercard', ELO: 'Elo', AMEX: 'Amex',
  HIPERCARD: 'Hipercard', HIPER: 'Hiper', DINERS: 'Diners', CABAL: 'Cabal', DISCOVER: 'Discover',
  JCB: 'JCB', SOROCRED: 'Sorocred', BANESCARD: 'Banescard',
}

/** Forma e bandeira: primeiro pelo arranjo_ur, depois pelo meio_pagamento. */
export function formaEBandeira(l: DetalheEdi): { forma: string; bandeira: string | null } {
  const arranjo = texto(l.arranjo_ur).toUpperCase()
  const [tipo, ...resto] = arranjo.split('_')
  const marca = resto.join('_')
  const bandeira = marca ? (BANDEIRAS[marca] ?? marca.slice(0, 40)) : null
  if (tipo === 'PIX') return { forma: 'Pix', bandeira: null }
  if (tipo === 'CREDIT') return { forma: 'Cartão de crédito', bandeira }
  if (tipo === 'DEBIT') return { forma: 'Cartão de débito', bandeira }
  if (tipo === 'PREPAID') return { forma: 'Cartão pré-pago', bandeira }
  if (tipo === 'VOUCHER' || tipo === 'BENEFIT') return { forma: 'Vale (VA/VR)', bandeira }
  if (tipo === 'BOLETO') return { forma: 'Boleto', bandeira: null }
  // Códigos vistos nos cenários da doc; sem tabela oficial publicada.
  switch (cod(l.meio_pagamento)) {
    case '3': return { forma: 'Cartão de crédito', bandeira }
    case '8': return { forma: 'Cartão de débito', bandeira }
    case '11': return { forma: 'Pix', bandeira: null }
    case '2': return { forma: 'Boleto', bandeira: null }
    default: return { forma: 'Maquininha', bandeira }
  }
}

/** Maquininha física, venda online, ou null se a linha não disser. */
export function capturaDaLinha(l: DetalheEdi): Captura | null {
  if (texto(l.numero_serie_leitor) || texto(l.leitor)) return 'maquininha'
  const canal = texto(l.canal_entrada).toUpperCase()
  const captura = cod(l.meio_captura)
  if (canal === 'W' || captura === '3') return 'online'
  if (canal.startsWith('M') || ['1', '2', '4', '5'].includes(captura)) return 'maquininha'
  return null
}

function codigoValido(v: unknown): string | null {
  const s = texto(v).toUpperCase()
  return /^[A-Z0-9_.:-]{4,80}$/.test(s) ? s : null
}

/** Valor que o lojista vendeu: original (sem juro do comprador), senão o total. */
function brutoDaLinha(l: DetalheEdi): number | null {
  const v = num(l.valor_original_transacao) ?? num(l.valor_total_transacao)
  return v === null ? null : arred(Math.abs(v))
}

function liquidoDaLinha(l: DetalheEdi): number | null {
  const v = num(l.valor_liquido_transacao)
  return v === null ? null : arred(Math.abs(v))
}

/**
 * Transforma as linhas do movimento transacional de UM dia em vendas.
 *
 * Venda e cancelamento do mesmo código no mesmo dia se anulam (ou reduzem a
 * venda, se o cancelamento foi parcial). Cancelamento sem a venda no dia vira
 * `ajuste`, para abater a venda que já está no banco.
 */
export function interpretarMovimento(detalhes: DetalheEdi[], dia: string): MovimentoInterpretado {
  const r: MovimentoInterpretado = {
    vendas: [], ajustes: [], canceladas: 0, parcelasAgrupadas: 0, outrosEventos: 0, invalidas: 0,
    linhas: detalhes.length,
  }
  const vendas = new Map<string, { linha: DetalheEdi }>()
  // Cancelamento: uma linha por parcela, cada uma com o valor da transação.
  // Conta só a menor parcela de cada código para não abater N vezes.
  const desfaz = new Map<string, { parcela: number; bruto: number; liquido: number | null }[]>()

  for (const l of detalhes) {
    const evento = cod(l.tipo_evento)
    const id = codigoValido(l.codigo_transacao)
    if (evento !== EVENTO_VENDA && !EVENTOS_DESFAZ.has(evento)) { r.outrosEventos++; continue }
    if (!id) { r.invalidas++; continue }
    const parcela = Number(cod(l.parcela)) || 1

    if (evento === EVENTO_VENDA) {
      // Outra parcela (ou a mesma repetida) da venda: os valores já são da transação inteira.
      if (vendas.has(id)) { r.parcelasAgrupadas++; continue }
      const bruto = brutoDaLinha(l)
      if (bruto === null || bruto === 0) { r.invalidas++; continue }
      vendas.set(id, { linha: l })
    } else {
      const bruto = brutoDaLinha(l)
      if (bruto === null) { r.invalidas++; continue }
      const lista = desfaz.get(id) ?? []
      lista.push({ parcela, bruto, liquido: liquidoDaLinha(l) })
      desfaz.set(id, lista)
    }
  }

  const somaDesfeita = (id: string) => {
    const lista = desfaz.get(id)
    if (!lista) return null
    const menor = Math.min(...lista.map(x => x.parcela))
    const daParcela = lista.filter(x => x.parcela === menor)
    const liquidos = daParcela.map(x => x.liquido)
    return {
      bruto: arred(daParcela.reduce((s, x) => s + x.bruto, 0)),
      liquido: liquidos.some(x => x === null) ? null : arred(liquidos.reduce<number>((s, x) => s + (x ?? 0), 0)),
    }
  }

  for (const [id, { linha }] of vendas) {
    let bruto = brutoDaLinha(linha)!
    let liquido = liquidoDaLinha(linha)
    if (liquido !== null && liquido > bruto) liquido = null // dado incoerente: não inventa taxa
    const d = somaDesfeita(id)
    if (d) {
      desfaz.delete(id)
      bruto = arred(bruto - d.bruto)
      if (bruto <= 0.009) { r.canceladas++; continue }
      liquido = liquido !== null && d.liquido !== null ? arred(Math.max(0, liquido - d.liquido)) : null
    }
    const { forma, bandeira } = formaEBandeira(linha)
    r.vendas.push({
      id,
      data: dataDaLinha(linha, dia),
      bruto,
      taxa: liquido === null ? null : arred(bruto - liquido),
      liquido,
      bandeira,
      forma,
      captura: capturaDaLinha(linha),
      parcelas: Math.max(1, Number(cod(linha.quantidade_parcelas)) || 1),
    })
  }

  for (const id of desfaz.keys()) {
    const d = somaDesfeita(id)!
    r.ajustes.push({ id, bruto: d.bruto, liquido: d.liquido })
  }
  return r
}

export type LinhaVendaEdi = {
  loja_id: string
  produto_id: null
  descricao: string
  quantidade: number
  valor_total: number
  lucro: number
  forma_pagamento: string
  origem: string
  adquirente: string
  id_externo: string
  taxa: number | null
  valor_liquido: number | null
  bandeira: string | null
  captura: Captura | null
  created_at: string
}

export function linhaVendaEdi(v: VendaEdi, lojaId: string): LinhaVendaEdi {
  const rotulo = v.captura === 'online' ? 'PagBank online' : 'Maquininha PagBank'
  const parcelado = v.parcelas > 1 ? ` · ${v.parcelas}x` : ''
  return {
    loja_id: lojaId,
    produto_id: null,
    descricao: `${rotulo} · ${v.forma}${parcelado}`,
    quantidade: 1,
    valor_total: v.bruto,
    lucro: 0, // o extrato não diz o custo; mesma regra da importação por arquivo
    forma_pagamento: v.forma,
    origem: ORIGEM_EDI,
    adquirente: ADQUIRENTE_EDI,
    id_externo: v.id,
    taxa: v.taxa,
    valor_liquido: v.liquido,
    bandeira: v.bandeira,
    captura: v.captura,
    created_at: v.data,
  }
}

// ── HTTP ────────────────────────────────────────────────────────────────────

export type RespostaDia =
  | { ok: true; validado: boolean; detalhes: DetalheEdi[]; status: number }
  | { ok: false; motivo: 'credencial_invalida' | 'limite' | 'erro'; status: number; mensagem: string }

export function cabecalhoBasic(estabelecimento: string, token: string): string {
  return 'Basic ' + Buffer.from(`${estabelecimento}:${token}`, 'utf8').toString('base64')
}

function lerValidado(h: Headers): boolean {
  return /^(true|1|s|sim)$/i.test((h.get('validado') ?? h.get('VALIDADO') ?? '').trim())
}

type Fetch = typeof fetch

/**
 * Busca o movimento transacional de um dia, com todas as páginas.
 * `soPrimeira` serve ao "Testar conexão": uma página de 1 item basta.
 */
export async function buscarDiaEdi(
  estabelecimento: string, token: string, dia: string,
  opts: { soPrimeira?: boolean; fetcher?: Fetch } = {},
): Promise<RespostaDia> {
  const f = opts.fetcher ?? fetch
  const detalhes: DetalheEdi[] = []
  let validado = true
  let totalPaginas = 1
  let status = 0
  for (let pagina = 1; pagina <= Math.min(totalPaginas, EDI_MAX_PAGINAS); pagina++) {
    const tamanho = opts.soPrimeira ? 1 : EDI_PAGE_SIZE
    const url = `${EDI_BASE}/movement/${EDI_VERSAO}/transactional/${dia}?pageNumber=${pagina}&pageSize=${tamanho}`
    let res: Response
    try {
      res = await f(url, {
        headers: { Authorization: cabecalhoBasic(estabelecimento, token), Accept: 'application/json' },
        cache: 'no-store',
        signal: AbortSignal.timeout(20_000),
      })
    } catch {
      return { ok: false, motivo: 'erro', status: 0, mensagem: 'O PagBank não respondeu a tempo.' }
    }
    status = res.status
    if (res.status === 401 || res.status === 403) {
      return { ok: false, motivo: 'credencial_invalida', status, mensagem: 'Número do estabelecimento ou token EDI recusado pelo PagBank.' }
    }
    if (res.status === 429) return { ok: false, motivo: 'limite', status, mensagem: 'O PagBank pediu para esperar antes de consultar de novo.' }
    // Dia sem movimento pode vir como 204/404 — vale só se o dia estiver validado.
    if (res.status === 204 || res.status === 404) {
      return { ok: true, validado: lerValidado(res.headers), detalhes, status }
    }
    if (!res.ok) return { ok: false, motivo: 'erro', status, mensagem: `O PagBank respondeu com erro (${res.status}).` }

    // Um dia só fica validado se TODAS as páginas vierem validadas.
    validado = validado && lerValidado(res.headers)
    const corpo = await res.json().catch(() => null) as { detalhes?: DetalheEdi[]; pagination?: { totalPages?: number } } | null
    if (!corpo || (corpo.detalhes !== undefined && !Array.isArray(corpo.detalhes))) {
      return { ok: false, motivo: 'erro', status, mensagem: 'Resposta do PagBank em formato inesperado.' }
    }
    detalhes.push(...(corpo.detalhes ?? []))
    if (opts.soPrimeira) break
    totalPaginas = Math.max(1, Number(corpo.pagination?.totalPages) || 1)
    if (totalPaginas > EDI_MAX_PAGINAS) {
      return { ok: false, motivo: 'erro', status, mensagem: 'Dia com movimento grande demais para sincronizar.' }
    }
  }
  return { ok: true, validado, detalhes, status }
}
