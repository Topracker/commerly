// Lê o arquivo do extrato (CSV, XLSX ou PDF) e devolve linhas cruas. Só servidor.
// Quem entende as colunas é app/lib/maquininhaImport.ts.

export type Celula = string | number | Date | null
export type Conteudo =
  | { tipo: 'tabela'; linhas: Celula[][] }
  | { tipo: 'texto'; linhas: string[] }

export const TAMANHO_MAX_ARQUIVO = 4 * 1024 * 1024 // a Vercel recusa corpo acima de 4,5 MB

export class ArquivoInvalido extends Error {}

/** UTF-8 quando válido; senão Windows-1252, o padrão do Excel no Brasil. */
function decodificar(buf: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^﻿/, '')
  } catch {
    return new TextDecoder('windows-1252').decode(buf)
  }
}

function separarCampos(linha: string, sep: string): string[] {
  const campos: string[] = []
  let atual = ''
  let aspas = false
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i]
    if (aspas) {
      if (c === '"' && linha[i + 1] === '"') { atual += '"'; i++ }
      else if (c === '"') aspas = false
      else atual += c
    } else if (c === '"') aspas = true
    else if (c === sep) { campos.push(atual); atual = '' }
    else atual += c
  }
  campos.push(atual)
  return campos
}

export function lerCsv(texto: string): Celula[][] {
  const linhas = texto.split(/\r?\n/).filter(l => l.trim() !== '')
  // O separador é o que mais divide as primeiras linhas (o extrato pode ter título).
  const amostra = linhas.slice(0, 30)
  let sep = ';'
  let melhor = 0
  for (const s of [';', ',', '\t']) {
    const maior = Math.max(0, ...amostra.map(l => separarCampos(l, s).length))
    if (maior > melhor) { melhor = maior; sep = s }
  }
  return linhas.map(l => separarCampos(l, sep).map(c => c.trim()))
}

async function lerXlsx(buf: Uint8Array): Promise<Celula[][]> {
  const { default: ExcelJS } = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  // O tipo do exceljs é de um Buffer antigo, incompatível com o do Node 24.
  await wb.xlsx.load(Buffer.from(buf) as unknown as ArrayBuffer)
  const aba = wb.worksheets.find(w => w.rowCount > 0)
  if (!aba) return []
  const linhas: Celula[][] = []
  aba.eachRow({ includeEmpty: false }, row => {
    const valores = (row.values as unknown[]).slice(1)
    linhas.push(valores.map(celulaXlsx))
  })
  return linhas
}

function celulaXlsx(v: unknown): Celula {
  if (v == null) return null
  if (typeof v === 'string' || typeof v === 'number' || v instanceof Date) return v
  if (typeof v === 'boolean') return String(v)
  if (typeof v === 'object') {
    const o = v as { result?: unknown; text?: unknown; richText?: { text: string }[] }
    if (o.richText) return o.richText.map(r => r.text).join('')
    if (o.result !== undefined) return celulaXlsx(o.result)
    if (o.text !== undefined) return celulaXlsx(o.text)
  }
  return null
}

async function lerPdf(buf: Uint8Array): Promise<string[]> {
  const { getDocumentProxy } = await import('unpdf')
  const pdf = await getDocumentProxy(buf)
  const linhas: string[] = []
  // Numa tabela em PDF, cada célula é um texto solto. A linha da tabela é o que
  // está na mesma altura da página, lido da esquerda para a direita.
  for (let n = 1; n <= pdf.numPages; n++) {
    const pagina = await pdf.getPage(n)
    const { items } = await pagina.getTextContent()
    const porAltura = new Map<number, { x: number; texto: string }[]>()
    for (const item of items) {
      if (!('str' in item) || !item.str.trim()) continue
      const y = Math.round(item.transform[5] / 3) // tolerância de 3 pontos
      const grupo = porAltura.get(y) ?? []
      grupo.push({ x: item.transform[4], texto: item.str.trim() })
      porAltura.set(y, grupo)
    }
    const alturas = [...porAltura.keys()].sort((a, b) => b - a)
    for (const y of alturas) {
      linhas.push(porAltura.get(y)!.sort((a, b) => a.x - b.x).map(c => c.texto).join(' '))
    }
  }
  return linhas
}

export async function lerArquivo(buf: Uint8Array, nome: string): Promise<Conteudo> {
  const ext = nome.toLowerCase().split('.').pop()
  try {
    if (ext === 'csv' || ext === 'txt') return { tipo: 'tabela', linhas: lerCsv(decodificar(buf)) }
    if (ext === 'xlsx') {
      // XLSX é um ZIP: recusa renomeado antes de chegar no parser.
      if (buf[0] !== 0x50 || buf[1] !== 0x4b) throw new ArquivoInvalido('Esse arquivo não é um Excel (.xlsx) de verdade.')
      return { tipo: 'tabela', linhas: await lerXlsx(buf) }
    }
    if (ext === 'pdf') {
      if (String.fromCharCode(buf[0], buf[1], buf[2], buf[3]) !== '%PDF') throw new ArquivoInvalido('Esse arquivo não é um PDF de verdade.')
      return { tipo: 'texto', linhas: await lerPdf(buf) }
    }
  } catch (e) {
    if (e instanceof ArquivoInvalido) throw e
    console.error('[maquininha] arquivo ilegível:', ext, e instanceof Error ? e.message : e)
    throw new ArquivoInvalido('Não conseguimos abrir esse arquivo. Baixe de novo e tente outra vez.')
  }
  throw new ArquivoInvalido('Use um arquivo CSV, XLSX ou PDF.')
}
