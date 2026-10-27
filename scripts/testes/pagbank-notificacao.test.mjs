// Teste do aviso de transação do PagBank (parse do XML + status).
// Rodar: node --test scripts/testes/pagbank-notificacao.test.mjs
// (Node 24 lê o .ts direto, sem build.)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  decodificarResposta,
  formaPagamentoPagBank,
  lerAvisoFormulario,
  parseTransacaoPagBank,
  statusGravaVenda,
  urlConsultaNotificacao,
} from '../../app/lib/pagbankNotificacao.ts'

// Formato da consulta v3 (developer.pagbank.com.br, "Consulta uma notificação
// de transação"). <paymentMethod> e <items> têm <code>/<amount> próprios de
// propósito: o parse não pode confundir com os da transação.
const XML = `<?xml version="1.0" encoding="ISO-8859-1" standalone="yes"?>
<transaction>
  <date>2026-10-26T14:32:10.000-03:00</date>
  <code>9E884542-81B3-4419-9A75-BCC6FB495EF1</code>
  <reference>REF-Burger &amp; Cia</reference>
  <type>1</type>
  <status>3</status>
  <lastEventDate>2026-10-26T14:33:00.000-03:00</lastEventDate>
  <paymentMethod>
    <type>1</type>
    <code>101</code>
  </paymentMethod>
  <grossAmount>49.90</grossAmount>
  <discountAmount>0.00</discountAmount>
  <netAmount>47.41</netAmount>
  <installmentCount>1</installmentCount>
  <itemCount>1</itemCount>
  <items>
    <item>
      <id>0001</id>
      <description><![CDATA[X-Bacon & fritas]]></description>
      <quantity>1</quantity>
      <amount>49.90</amount>
    </item>
  </items>
  <sender>
    <name>José da Silva</name>
    <email>comprador@sandbox.pagseguro.com.br</email>
  </sender>
</transaction>`

const comStatus = s => XML.replace('<status>3</status>', `<status>${s}</status>`)

test('parse: campos de primeiro nível da transação', () => {
  assert.deepEqual(parseTransacaoPagBank(XML), {
    code: '9E884542-81B3-4419-9A75-BCC6FB495EF1',
    status: 3,
    grossAmount: 49.9,
    paymentMethodType: 1,
    reference: 'REF-Burger & Cia',
    date: '2026-10-26T14:32:10.000-03:00',
  })
})

test('parse: <code> do paymentMethod não vaza, mesmo vindo antes', () => {
  const invertido = XML
    .replace(/\s*<code>9E884542[^<]*<\/code>/, '')
    .replace('</items>', '</items><code>AAAA1111-2222-3333-4444-555566667777</code>')
  assert.equal(parseTransacaoPagBank(invertido)?.code, 'AAAA1111-2222-3333-4444-555566667777')
})

test('parse: rejeita o que não é transação utilizável', () => {
  assert.equal(parseTransacaoPagBank('<errors><error><code>13001</code></error></errors>'), null)
  assert.equal(parseTransacaoPagBank('não é xml'), null)
  assert.equal(parseTransacaoPagBank('<transaction><code>X</code>'), null) // malformado
  assert.equal(parseTransacaoPagBank(XML.replace(/<code>9E88[^<]*<\/code>/, '')), null) // sem code
  assert.equal(parseTransacaoPagBank(XML.replace('<grossAmount>49.90', '<grossAmount>abc')), null)
  assert.equal(parseTransacaoPagBank(XML.replace('<status>3', '<status>x')), null)
  assert.equal(parseTransacaoPagBank(XML.replace(/<code>9E88[^<]*</, '<code>../../etc<')), null)
})

test('status: só 3 (Paga) e 4 (Disponível) gravam venda', () => {
  for (const s of [1, 2, 3, 4, 5, 6, 7, 8, 9]) {
    const t = parseTransacaoPagBank(comStatus(s))
    assert.equal(t?.status, s)
    assert.equal(statusGravaVenda(t.status), s === 3 || s === 4, `status ${s}`)
  }
})

test('forma de pagamento', () => {
  assert.equal(formaPagamentoPagBank(1), 'Cartão de crédito')
  assert.equal(formaPagamentoPagBank(2), 'Boleto')
  assert.equal(formaPagamentoPagBank(null), 'Maquininha')
  assert.equal(formaPagamentoPagBank(99), 'Maquininha')
})

test('aviso de formulário', () => {
  const code = '766B9C-AD4B044B04DA-77742F5FA653-E1AB24'
  const form = 'application/x-www-form-urlencoded; charset=ISO-8859-1'
  assert.deepEqual(lerAvisoFormulario(`notificationCode=${code}&notificationType=transaction`, form),
    { ok: true, notificationCode: code, notificationType: 'transaction' })
  // ordem trocada e sem content-type
  assert.deepEqual(lerAvisoFormulario(`notificationType=transaction&notificationCode=${code}`, ''),
    { ok: true, notificationCode: code, notificationType: 'transaction' })
  assert.equal(lerAvisoFormulario('notificationType=transaction', form)?.ok, false)
  assert.equal(lerAvisoFormulario('notificationCode=../x?y', form)?.ok, false)
  // JSON da Orders API segue para o caminho antigo
  assert.equal(lerAvisoFormulario('{"charges":[]}', 'application/json'), null)
})

test('URL de consulta e decodificação ISO-8859-1', () => {
  assert.equal(
    urlConsultaNotificacao('producao', 'ABC-123', 'loja@x.com', 't0k'),
    'https://ws.pagseguro.uol.com.br/v3/transactions/notifications/ABC-123?email=loja%40x.com&token=t0k')
  const bytes = Uint8Array.from(Buffer.from(XML, 'latin1')).buffer
  assert.ok(decodificarResposta(bytes, 'application/xml;charset=ISO-8859-1').includes('José'))
  assert.ok(decodificarResposta(bytes, '').includes('José')) // pela declaração do XML
})
