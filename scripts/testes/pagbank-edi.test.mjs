// Teste da leitura do Extrato EDI do PagBank (maquininha automática).
// Rodar: node --test scripts/testes/pagbank-edi.test.mjs
//
// As linhas abaixo são as dos CENÁRIOS DE TESTE da doc do PagBank
// (developer.pagbank.com.br/docs/cenarios-de-teste), com os mesmos valores.
// Ainda não houve resposta real de nenhuma loja.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buscarDiaEdi, capturaDaLinha, diasPendentes, formaEBandeira, interpretarMovimento, linhaVendaEdi,
  EDI_DIAS_INICIAIS,
} from '../../app/lib/pagbankEdi.ts'

process.env.PAGBANK_EDI_CHAVE = Buffer.alloc(32, 7).toString('base64')
const { cifrarToken, decifrarToken, finalDoToken } = await import('../../app/lib/pagbankEdiCripto.ts')

const DIA = '2024-07-30'
const base = {
  estabelecimento: '126984538', data_inicial_transacao: DIA, hora_inicial_transacao: '14:35:04',
  tipo_transacao: '1', status_pagamento: '1', pagamento_prazo: 'U',
}

// Cenário 1: Pix na maquininha (leitor 12, série preenchida).
const PIX_MAQUININHA = {
  ...base, movimento_api_codigo: 'B205A93E177B855E3407D628DBBDB172', tipo_evento: '1',
  codigo_transacao: '795D7A8F4D4649EF90A8DAA0311316F1', codigo_venda: '666667',
  valor_total_transacao: 108.96, valor_parcela: 107.88, parcela: '1', quantidade_parcelas: '0',
  valor_original_transacao: 108.96, taxa_intermediacao: 1.08, tarifa_intermediacao: 0.0,
  valor_liquido_transacao: 107.88, meio_pagamento: '11', canal_entrada: 'ME', leitor: '12',
  meio_captura: '5', numero_serie_leitor: '6G074610', arranjo_ur: 'PIX',
}

// Cenário 3: crédito online parcelado em 3 — três linhas, MESMO código.
const parcela = (n, v) => ({
  ...base, tipo_evento: '1', codigo_transacao: 'B140EE00000000000000000000000001',
  valor_total_transacao: 300, valor_parcela: v, parcela: String(n), quantidade_parcelas: '3',
  valor_original_transacao: 300, taxa_intermediacao: 8.97, tarifa_intermediacao: 2.0,
  valor_liquido_transacao: 289.03, meio_pagamento: '3', canal_entrada: 'W', leitor: '', meio_captura: '3',
  arranjo_ur: 'CREDIT_VISA',
})

// Cenário 7: parcelado pelo comprador — total 134,87 inclui o juro; o lojista vendeu 100.
const PARCELADO_COMPRADOR = {
  ...base, tipo_evento: '1', codigo_transacao: '87364200000000000000000000000007',
  valor_total_transacao: 134.87, valor_parcela: 94.41, parcela: '1', quantidade_parcelas: '10',
  valor_original_transacao: 100, taxa_intermediacao: 5.59, tarifa_intermediacao: 0,
  valor_liquido_transacao: 94.41, meio_pagamento: '3', canal_entrada: 'ME', meio_captura: '1',
  numero_serie_leitor: '68135918', arranjo_ur: 'CREDIT_VISA',
}

// Cenário 11: venda + cancelamento total no mesmo dia; e um parcial.
const venda11 = (cod, total, liq) => ({
  ...base, tipo_evento: '1', codigo_transacao: cod, valor_total_transacao: total, valor_parcela: liq,
  parcela: '1', quantidade_parcelas: '1', valor_original_transacao: total, valor_liquido_transacao: liq,
  meio_pagamento: '3', canal_entrada: 'W', meio_captura: '3', arranjo_ur: 'CREDIT_VISA',
})
const cancel11 = (cod, total, orig, liq) => ({ ...venda11(cod, total, liq), tipo_evento: '6', valor_original_transacao: orig })

test('Pix da maquininha: bruto, taxa, líquido, forma e captura', () => {
  const r = interpretarMovimento([PIX_MAQUININHA], DIA)
  assert.equal(r.vendas.length, 1)
  const v = r.vendas[0]
  assert.equal(v.id, '795D7A8F4D4649EF90A8DAA0311316F1')
  assert.equal(v.bruto, 108.96)
  assert.equal(v.liquido, 107.88)
  assert.equal(v.taxa, 1.08)
  assert.equal(v.forma, 'Pix')
  assert.equal(v.bandeira, null)
  assert.equal(v.captura, 'maquininha')
  // 14:35:04 em São Paulo (UTC−3) = 17:35:04Z
  assert.equal(v.data, '2024-07-30T17:35:04.000Z')
})

test('parcelado: 3 linhas do mesmo código viram UMA venda', () => {
  const r = interpretarMovimento([parcela(1, 96.34), parcela(2, 96.34), parcela(3, 96.35)], DIA)
  assert.equal(r.vendas.length, 1)
  assert.equal(r.parcelasAgrupadas, 2)
  const v = r.vendas[0]
  assert.equal(v.bruto, 300)
  assert.equal(v.liquido, 289.03)
  assert.equal(v.taxa, 10.97)
  assert.equal(v.parcelas, 3)
  assert.equal(v.captura, 'online')
  assert.equal(v.forma, 'Cartão de crédito')
  assert.equal(v.bandeira, 'Visa')
  assert.match(linhaVendaEdi(v, 'L').descricao, /PagBank online · Cartão de crédito · 3x/)
})

test('parcelado pelo comprador: conta o valor original, não o total com juro', () => {
  const v = interpretarMovimento([PARCELADO_COMPRADOR], DIA).vendas[0]
  assert.equal(v.bruto, 100)
  assert.equal(v.liquido, 94.41)
  assert.equal(v.taxa, 5.59)
  assert.equal(v.captura, 'maquininha')
})

test('cancelamento total no mesmo dia: a venda some; parcial reduz', () => {
  const r = interpretarMovimento([
    venda11('45EB8500000000000000000000000001', 111.80, 107.34),
    cancel11('45EB8500000000000000000000000001', 111.80, 111.80, 107.34),
    venda11('5BBA1800000000000000000000000002', 79.73, 76.55),
    cancel11('5BBA1800000000000000000000000002', 79.73, 39.87, 38.28),
  ], DIA)
  assert.equal(r.canceladas, 1)
  assert.equal(r.vendas.length, 1)
  const v = r.vendas[0]
  assert.equal(v.id, '5BBA1800000000000000000000000002')
  assert.equal(v.bruto, 39.86)
  assert.equal(v.liquido, 38.27)
  assert.equal(v.taxa, 1.59)
})

test('cancelamento de venda de outro dia vira ajuste; chargeback também', () => {
  const r = interpretarMovimento([
    cancel11('9D681400000000000000000000000003', 60.07, 60.07, 57.67),
    { ...cancel11('AAAA0000000000000000000000000004', 20, 20, 19.2), tipo_evento: '05' },
  ], DIA)
  assert.equal(r.vendas.length, 0)
  assert.deepEqual(r.ajustes.map(a => [a.id, a.bruto]), [
    ['9D681400000000000000000000000003', 60.07], ['AAAA0000000000000000000000000004', 20],
  ])
})

test('eventos que não são venda ficam de fora; linha sem código é inválida', () => {
  const r = interpretarMovimento([
    { ...PIX_MAQUININHA, tipo_evento: '4' }, // transferência
    { ...PIX_MAQUININHA, tipo_evento: '26' }, // taxa de cancelamento
    { ...PIX_MAQUININHA, codigo_transacao: '' },
  ], DIA)
  assert.equal(r.vendas.length, 0)
  assert.equal(r.outrosEventos, 2)
  assert.equal(r.invalidas, 1)
})

test('venda de R$ 1 na maquininha (débito)', () => {
  const r = interpretarMovimento([{
    ...base, tipo_evento: '1', codigo_transacao: 'C0FFEE00000000000000000000000001', valor_total_transacao: 1,
    valor_original_transacao: 1, valor_liquido_transacao: 0.99, parcela: '1', meio_pagamento: '8',
    canal_entrada: 'ME', meio_captura: '1', numero_serie_leitor: 'X1', arranjo_ur: 'DEBIT_MASTER',
  }], DIA)
  const l = linhaVendaEdi(r.vendas[0], 'loja-1')
  assert.equal(l.valor_total, 1)
  assert.equal(l.taxa, 0.01)
  assert.equal(l.valor_liquido, 0.99)
  assert.equal(l.lucro, 0)
  assert.equal(l.origem, 'maquininha_pagbank')
  assert.equal(l.adquirente, 'pagbank')
  assert.equal(l.captura, 'maquininha')
  assert.equal(l.bandeira, 'Mastercard')
  assert.equal(l.forma_pagamento, 'Cartão de débito')
})

test('forma por meio_pagamento quando não há arranjo; captura desconhecida = null', () => {
  assert.deepEqual(formaEBandeira({ meio_pagamento: '8' }), { forma: 'Cartão de débito', bandeira: null })
  assert.deepEqual(formaEBandeira({ meio_pagamento: '11' }), { forma: 'Pix', bandeira: null })
  assert.equal(capturaDaLinha({}), null)
})

test('diasPendentes: até ontem, sem hoje; primeira vez volta 30 dias', () => {
  const agora = new Date('2026-11-10T13:00:00Z') // 10h em SP
  assert.deepEqual(diasPendentes('2026-11-07', agora), ['2026-11-08', '2026-11-09'])
  assert.deepEqual(diasPendentes('2026-11-09', agora), [])
  const primeira = diasPendentes(null, agora)
  assert.equal(primeira.length, EDI_DIAS_INICIAIS)
  assert.equal(primeira.at(-1), '2026-11-09')
  // Às 01h UTC do dia 11 ainda é dia 10 em SP: ontem continua sendo 09.
  assert.deepEqual(diasPendentes('2026-11-08', new Date('2026-11-11T01:00:00Z')), ['2026-11-09'])
})

function fetchFalso(respostas) {
  const chamadas = []
  const f = async (url, init) => {
    chamadas.push({ url, auth: init.headers.Authorization })
    const r = respostas.shift()
    return new Response(r.corpo === undefined ? null : JSON.stringify(r.corpo), { status: r.status ?? 200, headers: r.headers ?? {} })
  }
  return { f, chamadas }
}

test('buscarDiaEdi: Basic Auth, paginação e VALIDADO', async () => {
  const { f, chamadas } = fetchFalso([
    { headers: { VALIDADO: 'TRUE' }, corpo: { detalhes: [PIX_MAQUININHA], pagination: { totalPages: 2, page: 1 } } },
    { headers: { VALIDADO: 'TRUE' }, corpo: { detalhes: [PARCELADO_COMPRADOR], pagination: { totalPages: 2, page: 2 } } },
  ])
  const r = await buscarDiaEdi('126984538', 'tok-secreto', DIA, { fetcher: f })
  assert.equal(r.ok, true)
  assert.equal(r.validado, true)
  assert.equal(r.detalhes.length, 2)
  assert.equal(chamadas.length, 2)
  assert.equal(chamadas[0].url, 'https://edi.api.pagbank.com.br/movement/v3.00/transactional/2024-07-30?pageNumber=1&pageSize=1000')
  assert.match(chamadas[1].url, /pageNumber=2/)
  assert.equal(chamadas[0].auth, 'Basic ' + Buffer.from('126984538:tok-secreto').toString('base64'))
})

test('buscarDiaEdi: dia não validado e credencial recusada', async () => {
  const nv = await buscarDiaEdi('1', 't', DIA, { fetcher: fetchFalso([{ headers: { VALIDADO: 'FALSE' }, corpo: { detalhes: [] } }]).f })
  assert.equal(nv.ok && nv.validado, false)
  const sem = await buscarDiaEdi('1', 't', DIA, { fetcher: fetchFalso([{ corpo: { detalhes: [] } }]).f })
  assert.equal(sem.ok && sem.validado, false) // sem header = não validado
  const neg = await buscarDiaEdi('1', 't', DIA, { fetcher: fetchFalso([{ status: 401 }]).f })
  assert.equal(neg.ok, false)
  assert.equal(neg.motivo, 'credencial_invalida')
})

test('cifra do token: ida e volta, presa à loja, sem texto puro', () => {
  const token = 'abc123-TOKEN-EDI-7741'
  const c = cifrarToken(token, 'loja-a')
  assert.ok(!c.includes(token))
  assert.equal(decifrarToken(c, 'loja-a'), token)
  assert.throws(() => decifrarToken(c, 'loja-b'))
  assert.notEqual(cifrarToken(token, 'loja-a'), c) // IV aleatório
  assert.equal(finalDoToken(token), '7741')
})
