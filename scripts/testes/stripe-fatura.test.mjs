// Teste do id da assinatura lido da fatura (formato antigo e novo da API).
// Rodar: node --test scripts/testes/stripe-fatura.test.mjs
// (Node 24 lê o .ts direto, sem build.)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { idAssinaturaDaFatura } from '../../app/lib/stripeFatura.ts'

test('formato novo: parent.subscription_details.subscription', () => {
  const inv = { parent: { type: 'subscription_details', subscription_details: { subscription: 'sub_novo' } } }
  assert.equal(idAssinaturaDaFatura(inv), 'sub_novo')
})

test('formato novo expandido: usa o .id', () => {
  const inv = { parent: { subscription_details: { subscription: { id: 'sub_exp' } } } }
  assert.equal(idAssinaturaDaFatura(inv), 'sub_exp')
})

test('formato novo tem prioridade sobre o antigo', () => {
  const inv = { subscription: 'sub_velho', parent: { subscription_details: { subscription: 'sub_novo' } } }
  assert.equal(idAssinaturaDaFatura(inv), 'sub_novo')
})

test('formato antigo: invoice.subscription string', () => {
  assert.equal(idAssinaturaDaFatura({ subscription: 'sub_antigo' }), 'sub_antigo')
})

test('formato antigo expandido: invoice.subscription.id', () => {
  assert.equal(idAssinaturaDaFatura({ subscription: { id: 'sub_antigo_exp' } }), 'sub_antigo_exp')
})

test('sem assinatura (fatura avulsa) → null', () => {
  assert.equal(idAssinaturaDaFatura({}), null)
  assert.equal(idAssinaturaDaFatura({ parent: null, subscription: null }), null)
  assert.equal(idAssinaturaDaFatura({ parent: { type: 'quote_details', subscription_details: null } }), null)
})
