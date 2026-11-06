// Teste da leitura do extrato da maquininha e da classificação da Point.
// Rodar: node --test scripts/testes/maquininha-import.test.mjs
//
// Os arquivos daqui são SINTÉTICOS: ainda não houve extrato real de nenhuma
// maquininha. Ao receber um, acrescente um caso com o layout de verdade.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import ExcelJS from 'exceljs'
import { jsPDF } from 'jspdf'
import {
  interpretarTabela, interpretarTextoPdf, linhaVendaImportada, origemDaMaquininha, parseData, parseValor,
  somaVendasParaDesconto, somaVendasParaMedalha,
} from '../../app/lib/maquininhaImport.ts'
import { lerArquivo, lerCsv } from '../../app/lib/maquininhaArquivo.ts'
import { ehPagamentoPoint, linhaVendaMP, sincronizarLojaMP, taxaDoPagamento } from '../../app/lib/mercadopago-sync.ts'

const AGORA = new Date('2026-11-06T15:00:00Z')

const CSV_PAGBANK = [
  'Extrato de vendas;;;;;;',
  'Período: 01/10/2026 a 31/10/2026;;;;;;',
  'Código da Transação;Data da Transação;Tipo de Pagamento;Bandeira;Valor Bruto;Valor Taxa;Valor Líquido;Status',
  'AAAA1111-0000-4000-8000-000000000001;31/10/2026 22:30;Crédito;Visa;R$ 100,00;R$ 3,00;R$ 97,00;Aprovada',
  'AAAA1111-0000-4000-8000-000000000002;30/10/2026 10:00;Débito;Master;1.250,50;-12,50;1.238,00;Aprovada',
  'AAAA1111-0000-4000-8000-000000000003;29/10/2026;Pix;;50,00;;;Aprovada',
  'AAAA1111-0000-4000-8000-000000000004;29/10/2026 11:00;Crédito;Elo;80,00;2,00;78,00;Cancelada',
  'AAAA1111-0000-4000-8000-000000000001;31/10/2026 22:30;Crédito;Visa;R$ 100,00;R$ 3,00;R$ 97,00;Aprovada',
  ';28/10/2026 09:00;Crédito;Visa;10,00;;;Aprovada',
  'AAAA1111-0000-4000-8000-000000000005;99/99/2026 09:00;Crédito;Visa;10,00;;;Aprovada',
  'Total;;;;1.400,50;;;',
].join('\r\n')

test('parseValor entende os formatos de dinheiro', () => {
  assert.equal(parseValor('R$ 1.234,56'), 1234.56)
  assert.equal(parseValor('1234.56'), 1234.56)
  assert.equal(parseValor('1,234.56'), 1234.56)
  assert.equal(parseValor('1.234'), 1234)
  assert.equal(parseValor('12,5'), 12.5)
  assert.equal(parseValor('-10,00'), -10)
  assert.equal(parseValor('(10,00)'), -10)
  assert.equal(parseValor(99.9), 99.9)
  assert.equal(parseValor('abc'), null)
  assert.equal(parseValor(''), null)
})

test('parseData lê o relógio da loja e recusa data fora do plausível', () => {
  // 22h30 em São Paulo (-03) é 01h30 UTC do dia seguinte: o dia da venda não pode virar.
  assert.equal(parseData('31/10/2026 22:30', AGORA).toISOString(), '2026-11-01T01:30:00.000Z')
  assert.equal(parseData('2026-10-31T14:30:00-03:00', AGORA).toISOString(), '2026-10-31T17:30:00.000Z')
  assert.equal(parseData('31/10/26', AGORA).toISOString(), '2026-10-31T15:00:00.000Z')
  assert.equal(parseData(new Date(Date.UTC(2026, 9, 31, 22, 30)), AGORA).toISOString(), '2026-11-01T01:30:00.000Z')
  assert.equal(parseData('31/13/2026', AGORA), null)
  assert.equal(parseData('10/12/2026', AGORA), null, 'futuro')
  assert.equal(parseData('01/01/2015', AGORA), null, 'antigo demais')
})

test('CSV do PagBank: título, cancelada, repetida, sem id, data ruim e rodapé', () => {
  const r = interpretarTabela(lerCsv(CSV_PAGBANK), 'pagbank', AGORA)
  assert.equal(r.vendas.length, 3)
  assert.equal(r.canceladas, 1)
  assert.equal(r.repetidasNoArquivo, 1)
  assert.equal(r.semId, 1)
  assert.equal(r.invalidas, 1)
  assert.deepEqual(r.colunasFaltando, [])

  const [a, b, c] = r.vendas
  assert.equal(a.bruto, 100); assert.equal(a.taxa, 3); assert.equal(a.liquido, 97)
  assert.equal(a.bandeira, 'Visa'); assert.equal(a.forma, 'Cartão de crédito')
  assert.equal(b.bruto, 1250.5); assert.equal(b.taxa, 12.5, 'taxa negativa vira positiva'); assert.equal(b.forma, 'Cartão de débito')
  assert.equal(c.forma, 'Pix'); assert.equal(c.liquido, null); assert.equal(c.taxa, null)
})

test('calcula a parte que falta: líquido pela taxa e taxa pelo líquido', () => {
  const r = interpretarTabela([
    ['Código da transação', 'Data', 'Valor', 'Taxa', 'Líquido'],
    ['ABCD1', '01/11/2026 10:00', '100,00', '4,00', ''],
    ['ABCD2', '01/11/2026 10:00', '100,00', '', '90,00'],
    ['ABCD3', '01/11/2026 10:00', '100,00', '', '150,00'],
  ], 'pagbank', AGORA)
  assert.equal(r.vendas[0].liquido, 96)
  assert.equal(r.vendas[1].taxa, 10)
  assert.equal(r.invalidas, 1, 'líquido maior que o bruto é coluna trocada')
})

test('não confunde data prevista de pagamento com a data da venda', () => {
  const r = interpretarTabela([['ID da transação', 'Data prevista de pagamento', 'Valor'], ['ABCD1', '01/11/2026', '10,00']], 'outra', AGORA)
  assert.equal(r.vendas.length, 0)
  assert.deepEqual(r.colunasFaltando, ['data'])
})

test('id que o Excel estragou não vira venda', () => {
  const r = interpretarTabela([
    ['Código da transação', 'Data', 'Valor'],
    [1.23e20, '01/11/2026', 10],
    ['1,23E+20', '01/11/2026', 10],
    [123456, '01/11/2026', 10],
  ], 'pagbank', AGORA)
  assert.equal(r.semId, 2)
  assert.equal(r.vendas.length, 1)
  assert.equal(r.vendas[0].id, '123456')
})

test('layouts de Stone, Cielo, InfinitePay e Mercado Pago acham o próprio id', () => {
  const casos = [['stone', 'Stone ID'], ['cielo', 'TID'], ['infinitepay', 'NSU'], ['mercadopago', 'Número da operação']]
  for (const [m, coluna] of casos) {
    const r = interpretarTabela([[coluna, 'Data da venda', 'Valor Bruto'], ['XYZ123', '01/11/2026', '10,00']], m, AGORA)
    assert.equal(r.vendas.length, 1, m)
  }
})

test('arquivo sem as colunas devolve o que faltou', () => {
  const r = interpretarTabela([['Nome', 'Telefone'], ['Ana', '62']], 'pagbank', AGORA)
  assert.equal(r.vendas.length, 0)
  assert.deepEqual(r.colunasFaltando, ['id da transação', 'data', 'valor'])
})

test('CSV com vírgula e aspas, e em Windows-1252', async () => {
  const csv = 'Código da transação,Data,Valor\nABCD1,01/11/2026,"1.000,00"\n'
  const latin = new Uint8Array(Buffer.from(csv, 'latin1'))
  const conteudo = await lerArquivo(latin, 'extrato.CSV')
  const r = interpretarTabela(conteudo.linhas, 'pagbank', AGORA)
  assert.equal(r.vendas[0].bruto, 1000)
})

test('XLSX de verdade: número, data e célula formatada', async () => {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Vendas')
  ws.addRow(['Relatório de vendas'])
  ws.addRow(['Código da Transação', 'Data da Transação', 'Tipo de Pagamento', 'Bandeira', 'Valor Bruto', 'Valor Líquido'])
  ws.addRow(['ABCD-0001', new Date(Date.UTC(2026, 9, 31, 22, 30)), 'Crédito', 'Visa', 100, 97])
  const buf = new Uint8Array(await wb.xlsx.writeBuffer())

  const conteudo = await lerArquivo(buf, 'extrato.xlsx')
  const r = interpretarTabela(conteudo.linhas, 'pagbank', AGORA)
  assert.equal(r.vendas.length, 1)
  assert.equal(r.vendas[0].data, '2026-11-01T01:30:00.000Z')
  assert.equal(r.vendas[0].taxa, 3)
})

test('PDF de verdade: junta as células da mesma altura e lê data, código e valores', async () => {
  const doc = new jsPDF({ orientation: 'landscape' })
  doc.setFontSize(8)
  doc.text('Extrato de vendas 01/10/2026 a 31/10/2026', 10, 10)
  // Desenha da direita para a esquerda: o PDF não garante a ordem das células.
  const linha = (y, celulas) => celulas.map((c, i) => [c, [10, 40, 110, 135, 160, 185, 210][i]]).reverse().forEach(([c, x]) => doc.text(c, x, y))
  linha(20, ['31/10/2026 22:30', 'AAAA1111-0000-4000-8000-000000000001', 'Credito', 'Visa', 'R$ 100,00', 'R$ 3,00', 'R$ 97,00'])
  linha(30, ['30/10/2026 10:00', 'BBBB2222-0000-4000-8000-000000000002', 'Debito', 'Cancelada', 'R$ 50,00'])
  const buf = new Uint8Array(doc.output('arraybuffer'))

  const conteudo = await lerArquivo(buf, 'extrato.pdf')
  assert.equal(conteudo.tipo, 'texto')
  const r = interpretarTextoPdf(conteudo.linhas, AGORA)
  assert.equal(r.vendas.length, 1)
  assert.equal(r.canceladas, 1)
  assert.equal(r.vendas[0].bruto, 100)
  assert.equal(r.vendas[0].taxa, 3)
  assert.equal(r.vendas[0].liquido, 97)
  assert.equal(r.vendas[0].bandeira, 'visa')
})

test('arquivo renomeado é recusado antes do parser', async () => {
  await assert.rejects(lerArquivo(new Uint8Array(Buffer.from('nao sou excel')), 'a.xlsx'), /Excel/)
  await assert.rejects(lerArquivo(new Uint8Array(Buffer.from('nao sou pdf!')), 'a.pdf'), /PDF/)
  await assert.rejects(lerArquivo(new Uint8Array(Buffer.from('x')), 'a.exe'), /CSV, XLSX ou PDF/)
})

test('desconto da mensalidade: maquininha não soma, o resto soma', () => {
  assert.equal(somaVendasParaDesconto([
    { valor_total: 100, origem: 'manual' },
    { valor_total: '50.5', origem: 'mercadopago' },
    { valor_total: 9000, origem: 'maquininha_pagbank' },
    { valor_total: 9000, origem: 'maquininha_mp' },
    { valor_total: 9000, origem: 'maquininha_outra' },
    { valor_total: 10 },
  ]), 160.5)
})

test('medalha: importada por arquivo não soma, Point sincronizada soma', () => {
  assert.equal(somaVendasParaMedalha([
    { valor_total: 100, origem: 'manual', mp_payment_id: null },
    { valor_total: 50, origem: 'mercadopago', mp_payment_id: '1' },
    { valor_total: 30, origem: 'maquininha_mp', mp_payment_id: '2' },
    { valor_total: 9000, origem: 'maquininha_mp', mp_payment_id: null },
    { valor_total: 9000, origem: 'maquininha_pagbank', mp_payment_id: null },
  ]), 180)
})

test('linha importada separa origem e mantém o bruto em valor_total', () => {
  const l = linhaVendaImportada({ id: 'X1', data: '2026-11-01T01:30:00.000Z', bruto: 100, taxa: 3, liquido: 97, bandeira: 'Visa', forma: 'Cartão de crédito' }, 'loja', 'stone')
  assert.equal(l.origem, 'maquininha_stone')
  assert.equal(l.valor_total, 100)
  assert.equal(l.lucro, 0)
  assert.equal(l.created_at, '2026-11-01T01:30:00.000Z')
  assert.equal(origemDaMaquininha('mercadopago'), 'maquininha_mp')
})

const POINT = {
  id: 987, status: 'approved', operation_type: 'pos_payment', payment_type_id: 'credit_card', payment_method_id: 'visa',
  transaction_amount: 100, date_approved: '2026-10-31T22:30:00.000-03:00',
  transaction_details: { net_received_amount: 96.5 },
  fee_details: [{ type: 'mercadopago_fee', fee_payer: 'collector', amount: 3.5 }],
}
const ONLINE = { id: 654, status: 'approved', operation_type: 'regular_payment', payment_type_id: 'bank_transfer', transaction_amount: 40 }

test('Point: classifica e preenche bruto, taxa, líquido, bandeira, data e id', () => {
  assert.equal(ehPagamentoPoint(POINT), true)
  assert.equal(ehPagamentoPoint({ point_of_interaction: { type: 'POINT' } }), true)
  assert.equal(ehPagamentoPoint(ONLINE), false)

  const l = linhaVendaMP(POINT, 'loja')
  assert.equal(l.origem, 'maquininha_mp')
  assert.equal(l.valor_total, 100)
  assert.equal(l.taxa, 3.5)
  assert.equal(l.valor_liquido, 96.5)
  assert.equal(l.bandeira, 'visa')
  assert.equal(l.id_externo, '987')
  assert.equal(l.mp_payment_id, '987')
  assert.equal(l.created_at, '2026-11-01T01:30:00.000Z')
})

test('taxa cai para bruto − líquido e ignora taxa paga pelo comprador', () => {
  assert.equal(taxaDoPagamento({ transaction_amount: 100, transaction_details: { net_received_amount: 95 } }), 5)
  assert.equal(taxaDoPagamento({ transaction_amount: 100, fee_details: [{ fee_payer: 'payer', amount: 9 }], transaction_details: { net_received_amount: 100 } }), 0)
  assert.equal(taxaDoPagamento({ transaction_amount: 100 }), null)
})

test('pagamento online continua com a linha de sempre, sem colunas novas', () => {
  const l = linhaVendaMP(ONLINE, 'loja')
  assert.equal(l.origem, 'mercadopago')
  assert.equal('id_externo' in l, false)
  assert.equal('created_at' in l, false)
})

test('sync pagina, não regrava o que veio no extrato e separa a Point', async (t) => {
  const pagina1 = Array.from({ length: 50 }, (_, i) => ({ ...POINT, id: 1000 + i }))
  const pagina2 = [{ ...POINT, id: 2000 }, ONLINE]
  const offsets = []
  t.mock.method(globalThis, 'fetch', async (url) => {
    const offset = Number(new URL(url).searchParams.get('offset'))
    offsets.push(offset)
    return { ok: true, status: 200, json: async () => ({ results: offset === 0 ? pagina1 : pagina2 }) }
  })

  const inseridas = []
  const admin = {
    from: () => ({
      select(coluna) {
        const q = {
          eq: () => q,
          in: async () => ({ data: coluna === 'id_externo' ? [{ id_externo: '1000' }] : [{ mp_payment_id: '1001' }], error: null }),
        }
        return q
      },
      insert: async (linhas) => { inseridas.push(...linhas); return { error: null } },
    }),
  }

  const r = await sincronizarLojaMP(admin, 'loja', 'token')
  assert.deepEqual(offsets, [0, 50])
  assert.equal(r.ok, true)
  assert.equal(r.encontrados, 52)
  assert.equal(r.novas, 50, 'duas já existiam: uma importada e uma sincronizada')
  assert.equal(inseridas.find(l => l.mp_payment_id === '1000'), undefined)
  assert.equal(inseridas.filter(l => l.origem === 'maquininha_mp').length, 49)
  assert.equal(inseridas.filter(l => l.origem === 'mercadopago').length, 1)
})
