// Interpreta o extrato da maquininha: acha as colunas, converte valores e datas
// e separa o que vira venda do que deve ser ignorado. Sem dependências, para
// rodar direto no Node (scripts/testes/maquininha-import.test.mjs).
//
// ATENÇÃO: os nomes de coluna abaixo são os usuais do mercado, NÃO foram
// conferidos em extrato real de nenhuma maquininha. Ao receber um arquivo de
// verdade, ajuste os apelidos do layout e acrescente um teste. A comparação é
// EXATA de propósito: "Data prevista de pagamento" não pode virar a data da venda.

export const MAQUININHAS = ['pagbank', 'mercadopago', 'stone', 'cielo', 'infinitepay', 'outra'] as const
export type Maquininha = typeof MAQUININHAS[number]

export const ROTULO_MAQUININHA: Record<Maquininha, string> = {
  pagbank: 'PagBank',
  mercadopago: 'Mercado Pago',
  stone: 'Stone',
  cielo: 'Cielo',
  infinitepay: 'InfinitePay',
  outra: 'Outra',
}

export function origemDaMaquininha(m: Maquininha): string {
  return m === 'mercadopago' ? 'maquininha_mp' : `maquininha_${m}`
}

export function ehVendaMaquininha(origem: string | null | undefined): boolean {
  return !!origem?.startsWith('maquininha_')
}

/**
 * Vendas que valem para as faixas de desconto da mensalidade (10% e 15%). Venda
 * de maquininha fica de fora: o extrato é arquivo enviado pelo próprio lojista, e
 * só venda feita dentro da Commerly conta. A regra é só do desconto: meta, Score
 * e financeiro seguem somando a maquininha.
 */
export function somaVendasParaDesconto(vendas: { valor_total: unknown; origem?: string | null }[]): number {
  return vendas.reduce((s, v) => (ehVendaMaquininha(v.origem) ? s : s + (Number(v.valor_total) || 0)), 0)
}

type Campo = 'id' | 'data' | 'bruto' | 'liquido' | 'taxa' | 'bandeira' | 'forma' | 'status'

const COMUNS: Record<Campo, string[]> = {
  id: ['id da transacao', 'codigo da transacao', 'id transacao', 'codigo transacao', 'transacao', 'identificador', 'nsu'],
  data: ['data da transacao', 'data da venda', 'data e hora', 'data hora', 'data'],
  bruto: ['valor bruto', 'valor da transacao', 'valor da venda', 'valor total', 'valor'],
  liquido: ['valor liquido', 'liquido', 'valor a receber', 'valor recebido'],
  taxa: ['taxa', 'taxas', 'valor da taxa', 'valor taxa', 'tarifa', 'tarifas', 'mdr'],
  bandeira: ['bandeira', 'bandeira do cartao'],
  forma: ['forma de pagamento', 'meio de pagamento', 'tipo de pagamento', 'tipo de transacao', 'modalidade', 'produto', 'tipo'],
  status: ['status', 'situacao', 'status da transacao', 'status da venda'],
}

// O que cada maquininha acrescenta, com prioridade sobre os nomes comuns.
const LAYOUTS: Record<Maquininha, Partial<Record<Campo, string[]>>> = {
  pagbank: {
    id: ['codigo da transacao', 'codigo de transacao', 'id da transacao'],
    data: ['data da transacao', 'data de criacao'],
    forma: ['tipo de pagamento', 'forma de pagamento', 'meio de captura'],
  },
  mercadopago: {
    id: ['numero da operacao', 'id da operacao', 'numero de operacao', 'id da operacao no mercado pago'],
    data: ['data de criacao', 'data da compra', 'data de aprovacao'],
    bruto: ['valor do produto', 'valor da compra'],
    liquido: ['valor recebido', 'valor liquido recebido'],
    taxa: ['tarifa do mercado pago', 'tarifa de venda'],
  },
  stone: { id: ['stone id', 'stoneid', 'id stone', 'codigo da transacao'] },
  cielo: { id: ['tid', 'nsu/doc', 'nsu doc', 'nsu cv', 'codigo da venda'], data: ['data da venda'] },
  infinitepay: { id: ['nsu', 'id da transacao', 'codigo da venda'] },
  outra: {},
}

export type VendaImportada = {
  id: string
  data: string // ISO em UTC
  bruto: number
  taxa: number | null
  liquido: number | null
  bandeira: string | null
  forma: string
}

export type ResultadoLeitura = {
  vendas: VendaImportada[]
  /** Canceladas, recusadas, estornadas ou com valor negativo. */
  canceladas: number
  /** Sem id da transação utilizável: não dá para deduplicar, então não entram. */
  semId: number
  /** Valor ou data que não deu para entender. */
  invalidas: number
  repetidasNoArquivo: number
  /** Colunas obrigatórias não encontradas; preenchido quando nada foi reconhecido. */
  colunasFaltando: string[]
  /** Colunas encontradas no arquivo, para a tela ajudar quem precisa de suporte. */
  cabecalho: string[]
}

export function normalizar(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9/]+/g, ' ').trim()
}

/** "R$ 1.234,56", "1234.56", "1,234.56", "(10,00)", número do Excel. Null se não for valor. */
export function parseValor(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v * 100) / 100 : null
  if (typeof v !== 'string') return null
  let s = v.replace(/R\$|\s/gi, '')
  if (!s) return null
  let negativo = false
  if (/^\(.*\)$/.test(s)) { negativo = true; s = s.slice(1, -1) }
  if (/^-/.test(s) || /-$/.test(s)) { negativo = true; s = s.replace(/-/g, '') }
  if (!/^\d[\d.,]*$/.test(s)) return null
  const virgula = s.lastIndexOf(',')
  const ponto = s.lastIndexOf('.')
  if (virgula > ponto) s = s.replace(/\./g, '').replace(',', '.')
  else if (ponto > virgula && virgula !== -1) s = s.replace(/,/g, '')
  else if (ponto !== -1 && /^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '')
  const n = Number(s)
  if (!Number.isFinite(n)) return null
  return Math.round((negativo ? -n : n) * 100) / 100
}

/** Instante UTC de um horário de relógio em São Paulo. */
function deSaoPaulo(a: number, m: number, d: number, h: number, mi: number, s: number): Date {
  const palpite = Date.UTC(a, m - 1, d, h, mi, s)
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(palpite))
  const n = (t: string) => Number(p.find(x => x.type === t)?.value)
  const relogio = Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'), n('second'))
  return new Date(palpite - (relogio - palpite))
}

/**
 * "31/10/2026 14:30", "2026-10-31T14:30:00-03:00", Date do Excel.
 * Data do extrato é horário de relógio da loja. O Excel guarda esse relógio nos
 * campos UTC do Date, então ele é lido com getUTC*.
 */
export function parseData(v: unknown, agora: Date = new Date()): Date | null {
  let dt: Date | null = null
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null
    dt = deSaoPaulo(v.getUTCFullYear(), v.getUTCMonth() + 1, v.getUTCDate(), v.getUTCHours(), v.getUTCMinutes(), v.getUTCSeconds())
  } else if (typeof v === 'string') {
    const s = v.trim()
    const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4}|\d{2})(?:[ T,]+(?:às )?(\d{1,2}):(\d{2})(?::(\d{2}))?)?/)
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?(.*)$/)
    if (br) {
      const ano = br[3].length === 2 ? 2000 + Number(br[3]) : Number(br[3])
      const dia = Number(br[1])
      const mes = Number(br[2])
      if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null
      dt = deSaoPaulo(ano, mes, dia, Number(br[4] ?? 12), Number(br[5] ?? 0), Number(br[6] ?? 0))
    } else if (iso) {
      if (/(Z|[+-]\d{2}:?\d{2})/i.test(iso[7] ?? '')) dt = new Date(s)
      else dt = deSaoPaulo(Number(iso[1]), Number(iso[2]), Number(iso[3]), Number(iso[4] ?? 12), Number(iso[5] ?? 0), Number(iso[6] ?? 0))
    }
  }
  if (!dt || Number.isNaN(dt.getTime())) return null
  // Venda no futuro ou de mais de 5 anos é coluna errada, não venda.
  if (dt.getTime() > agora.getTime() + 86_400_000) return null
  if (dt.getTime() < agora.getTime() - 5 * 365 * 86_400_000) return null
  return dt
}

/** Id da transação, ou null se não servir para deduplicar. */
function parseId(v: unknown): string | null {
  // Número grande no Excel já perdeu dígitos: duas vendas viram o mesmo id.
  if (typeof v === 'number') return Number.isSafeInteger(v) && v > 0 ? String(v) : null
  if (typeof v !== 'string') return null
  const s = v.trim().replace(/^'/, '').toUpperCase()
  if (s.length < 4 || s.length > 80) return null
  if (/^\d[\d.,]*E\+?\d+$/.test(s)) return null // notação científica do Excel
  return /^[A-Z0-9_./:-]+$/.test(s) ? s : null
}

const STATUS_FORA = /cancel|estorn|recus|negad|devolv|chargeback|contest|falh|nao autoriz|desfeit|rejeit|pendente/

function formaLegivel(v: unknown): string {
  const f = normalizar(String(v ?? ''))
  if (f.includes('pix')) return 'Pix'
  if (f.includes('debito') || f.includes('debit')) return 'Cartão de débito'
  if (f.includes('credito') || f.includes('credit')) return 'Cartão de crédito'
  if (f.includes('voucher') || f.includes('vale')) return 'Vale (VA/VR)'
  return 'Maquininha'
}

function textoOuNull(v: unknown, max = 40): string | null {
  const s = String(v ?? '').trim()
  return s ? s.slice(0, max) : null
}

function acharColunas(linha: unknown[], m: Maquininha): Partial<Record<Campo, number>> {
  const cab = linha.map(c => normalizar(String(c ?? '')))
  const col: Partial<Record<Campo, number>> = {}
  for (const campo of Object.keys(COMUNS) as Campo[]) {
    for (const nome of [...(LAYOUTS[m][campo] ?? []), ...COMUNS[campo]]) {
      const i = cab.indexOf(nome)
      if (i !== -1) { col[campo] = i; break }
    }
  }
  return col
}

function vazio(): ResultadoLeitura {
  return { vendas: [], canceladas: 0, semId: 0, invalidas: 0, repetidasNoArquivo: 0, colunasFaltando: [], cabecalho: [] }
}

function arred(n: number): number {
  return Math.round(n * 100) / 100
}

export function interpretarTabela(linhas: unknown[][], m: Maquininha, agora: Date = new Date()): ResultadoLeitura {
  const r = vazio()
  // O extrato costuma ter título e período antes do cabeçalho.
  let inicio = -1
  let col: Partial<Record<Campo, number>> = {}
  let melhor = -1
  for (let i = 0; i < Math.min(linhas.length, 40); i++) {
    const c = acharColunas(linhas[i], m)
    const pontos = ['id', 'data', 'bruto'].filter(k => c[k as Campo] !== undefined).length
    if (pontos > melhor) {
      melhor = pontos
      if (pontos === 3) { inicio = i; col = c; break }
      r.cabecalho = linhas[i].map(x => String(x ?? '')).filter(Boolean)
      r.colunasFaltando = [
        c.id === undefined ? 'id da transação' : '',
        c.data === undefined ? 'data' : '',
        c.bruto === undefined ? 'valor' : '',
      ].filter(Boolean)
    }
  }
  if (inicio === -1) return r
  r.colunasFaltando = []
  r.cabecalho = linhas[inicio].map(x => String(x ?? '')).filter(Boolean)

  const vistos = new Set<string>()
  for (const l of linhas.slice(inicio + 1)) {
    if (l.every(c => c == null || String(c).trim() === '')) continue
    const pega = (k: Campo) => (col[k] === undefined ? null : l[col[k]!])

    const brutoLido = parseValor(pega('bruto'))
    const idLido = parseId(pega('id'))
    // Linha de total no rodapé: tem valor, mas não tem data, e o "id" é a palavra Total.
    const semData = String(pega('data') ?? '').trim() === ''
    if (semData && (idLido === null || /^(SUB)?TOTA(L|IS)/.test(idLido))) continue

    const status = normalizar(String(pega('status') ?? ''))
    if (STATUS_FORA.test(status) || (brutoLido !== null && brutoLido < 0)) { r.canceladas++; continue }
    if (idLido === null) { r.semId++; continue }

    const data = parseData(pega('data'), agora)
    if (brutoLido === null || brutoLido === 0 || !data) { r.invalidas++; continue }

    if (vistos.has(idLido)) { r.repetidasNoArquivo++; continue }
    vistos.add(idLido)

    let taxa = parseValor(pega('taxa'))
    let liquido = parseValor(pega('liquido'))
    if (taxa !== null) taxa = Math.abs(taxa) // alguns extratos trazem a taxa negativa
    if (liquido !== null && liquido > brutoLido) { r.invalidas++; vistos.delete(idLido); continue }
    if (taxa === null && liquido !== null) taxa = arred(brutoLido - liquido)
    if (liquido === null && taxa !== null) liquido = arred(brutoLido - taxa)

    r.vendas.push({
      id: idLido,
      data: data.toISOString(),
      bruto: brutoLido,
      taxa,
      liquido,
      bandeira: textoOuNull(pega('bandeira')),
      forma: formaLegivel(pega('forma') ?? pega('bandeira')),
    })
  }
  return r
}

const RE_VALOR_PDF = /(?:R\$\s*)?-?\d{1,3}(?:\.\d{3})*,\d{2}\b/g
const RE_DATA_PDF = /\b\d{2}\/\d{2}\/\d{2,4}(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?/
// UUID, ou código longo com letras e números. Número puro curto pode ser agência ou parcela.
const RE_ID_PDF = /\b(?:[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}|(?=[A-Za-z0-9_-]*\d)(?=[A-Za-z0-9_-]*[A-Za-z])[A-Za-z0-9_-]{8,}|\d{8,})\b/

/**
 * PDF não tem colunas: cada linha precisa trazer data, código e valor. Com
 * vários valores, o maior é o bruto e o resto é deduzido da conta bruto − taxa =
 * líquido. É um chute educado até termos PDF real, por isso a tela avisa para
 * conferir a prévia e prefere CSV ou XLSX.
 */
export function interpretarTextoPdf(linhas: string[], agora: Date = new Date()): ResultadoLeitura {
  const r = vazio()
  const vistos = new Set<string>()
  for (const linha of linhas) {
    const textoData = linha.match(RE_DATA_PDF)?.[0]
    if (!textoData) continue
    const semData = linha.replace(RE_DATA_PDF, ' ')
    const valores = (semData.match(RE_VALOR_PDF) ?? []).map(v => parseValor(v)).filter((v): v is number => v !== null)
    if (valores.length === 0) continue // data solta: cabeçalho ou período

    if (STATUS_FORA.test(normalizar(linha)) || valores.some(v => v < 0)) { r.canceladas++; continue }
    const semValores = semData.replace(RE_VALOR_PDF, ' ')
    const id = semValores.match(RE_ID_PDF)?.[0]?.toUpperCase()
    if (!id) { r.semId++; continue }
    const data = parseData(textoData, agora)
    if (!data) { r.invalidas++; continue }
    if (vistos.has(id)) { r.repetidasNoArquivo++; continue }
    vistos.add(id)

    const ordenados = [...valores].sort((a, b) => b - a)
    const bruto = ordenados[0]
    let taxa: number | null = null
    let liquido: number | null = null
    if (ordenados.length >= 3 && Math.abs(ordenados[1] + ordenados[2] - bruto) < 0.02) {
      liquido = ordenados[1]
      taxa = ordenados[2]
    } else if (ordenados.length === 2) {
      // O segundo valor é o líquido se for maior que a metade; senão é a taxa.
      if (ordenados[1] >= bruto / 2) { liquido = ordenados[1]; taxa = arred(bruto - liquido) }
      else { taxa = ordenados[1]; liquido = arred(bruto - taxa) }
    }
    const n = normalizar(linha)
    const bandeira = n.match(/\b(visa|master|mastercard|elo|amex|hipercard)\b/)?.[1] ?? null
    r.vendas.push({ id, data: data.toISOString(), bruto, taxa, liquido, bandeira, forma: formaLegivel(n) })
  }
  return r
}

export type LinhaVendaImportada = {
  loja_id: string
  produto_id: null
  descricao: string
  quantidade: number
  valor_total: number
  lucro: number
  forma_pagamento: string
  origem: string
  adquirente: Maquininha
  id_externo: string
  taxa: number | null
  valor_liquido: number | null
  bandeira: string | null
  created_at: string
}

export function linhaVendaImportada(v: VendaImportada, lojaId: string, m: Maquininha): LinhaVendaImportada {
  const rotulo = m === 'outra' ? 'Maquininha' : `Maquininha ${ROTULO_MAQUININHA[m]}`
  return {
    loja_id: lojaId,
    produto_id: null,
    descricao: `${rotulo} · ${v.forma}`,
    quantidade: 1,
    valor_total: v.bruto,
    lucro: 0, // o extrato não diz o custo; mesma regra das integrações
    forma_pagamento: v.forma,
    origem: origemDaMaquininha(m),
    adquirente: m,
    id_externo: v.id,
    taxa: v.taxa,
    valor_liquido: v.liquido,
    bandeira: v.bandeira,
    created_at: v.data,
  }
}
