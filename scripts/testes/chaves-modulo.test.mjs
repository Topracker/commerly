// Teste do registro central das chaves de módulo.
// Rodar: node --test scripts/testes/chaves-modulo.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  APIS_MODULO, LOGINS_MODULO, PAGINAS_MODULO, TEXTO_PAUSA, chaveDesligada, ehModuloPausavel, listaPapeis,
  mapaPublico, modulosDaApi, modulosDaPagina,
} from '../../app/lib/pausa.ts'

const inclui = (lista, m) => lista.includes(m)

test('páginas: rota do módulo e sub-rotas pertencem à chave', () => {
  const casos = [
    ['/cliente/buscar', 'cliente'], ['/cliente/onboarding', 'cliente'], ['/cliente/loja/123', 'cliente'], ['/para-clientes', 'cliente'],
    ['/entregador-delivery/onboarding', 'entregador'], ['/para-entregadores', 'entregador'], ['/entregador/nome-123', 'entregador'],
    ['/fornecedor/onboarding', 'fornecedor'], ['/fornecedor/uuid', 'fornecedor'], ['/fornecedores', 'fornecedor'], ['/fornecedores/comparar', 'fornecedor'],
    ['/expansao', 'delivery'], ['/expansao/goiania', 'delivery'],
    ['/commerly-ai', 'ia'], ['/assistente', 'ia'],
    ['/cliente/clube', 'cashback'],
    ['/medalhas', 'gamificacao'], ['/medalhas/x', 'gamificacao'], ['/ranking', 'gamificacao'], ['/hall-da-fama', 'gamificacao'], ['/cliente/ranking', 'gamificacao'],
    ['/kit', 'kit'], ['/loja', 'kit'],
    ['/fundadores', 'fundadores'], ['/embaixadores', 'embaixadores'], ['/embaixador', 'embaixadores'], ['/convite/ABC', 'embaixadores'],
    ['/cliente/festa', 'modo_festa'], ['/cliente/festa/entrar/ABC', 'modo_festa'],
  ]
  for (const [rota, m] of casos) assert.ok(inclui(modulosDaPagina(rota), m), `${rota} -> ${m}`)
})

test('páginas: quem termina algo em andamento continua aberto', () => {
  for (const rota of ['/cliente/pedidos', '/cliente/pedidos/1', '/cliente/notificacoes', '/cliente/mensagens/1', '/cliente/festa/uuid-da-festa'])
    assert.ok(!inclui(modulosDaPagina(rota), 'cliente'), rota)
  assert.ok(!inclui(modulosDaPagina('/cliente/festa/uuid-da-festa'), 'modo_festa'))
  for (const rota of ['/entregador-delivery/dashboard', '/entregador-delivery/notificacoes'])
    assert.ok(!inclui(modulosDaPagina(rota), 'entregador'), rota)
  for (const rota of ['/fornecedor/dashboard', '/fornecedor/mensagens/1', '/fornecedor/produtos'])
    assert.ok(!inclui(modulosDaPagina(rota), 'fornecedor'), rota)
})

test('páginas: não confunde rotas parecidas nem bloqueia a loja', () => {
  assert.deepEqual(modulosDaPagina('/loja/uuid-da-loja'), [])
  assert.deepEqual(modulosDaPagina('/'), [])
  assert.deepEqual(modulosDaPagina('/dashboard'), [])
  assert.deepEqual(modulosDaPagina('/pedidos'), [])
  assert.deepEqual(modulosDaPagina('/pausado'), [])
  assert.deepEqual(modulosDaPagina('/kitchen'), [])
  assert.ok(!inclui(modulosDaPagina('/entregador-delivery/dashboard'), 'entregador'))
  assert.ok(!inclui(modulosDaPagina('/fornecedor/dashboard'), 'fornecedor'))
})

test('login é tratado à parte, para não prender quem tem algo a terminar', () => {
  for (const [rota, m] of Object.entries(LOGINS_MODULO)) {
    assert.ok(!inclui(modulosDaPagina(rota), m), rota)
    assert.ok(ehModuloPausavel(m))
  }
})

test('APIs: toda rota do módulo pertence à chave', () => {
  const casos = [
    ['/api/cliente/lojas', 'cliente'], ['/api/cliente/pedido-checkout', 'cliente'],
    ['/api/entregador/aceitar-pedido', 'entregador'], ['/api/entregador/responder-corrida', 'entregador'], ['/api/entregador/stripe-connect', 'entregador'],
    ['/api/entrega/buscar-entregador', 'entregador'], ['/api/entrega/buscar-entregador', 'delivery'],
    ['/api/fornecedor/stripe-connect', 'fornecedor'], ['/api/b2b/checkout', 'fornecedor'],
    ['/api/assistente', 'ia'], ['/api/commerly-ai/gerar', 'ia'], ['/api/copilot/insights', 'ia'], ['/api/cardapio/gerar', 'ia'],
    ['/api/cardapio/digitalizar', 'ia'], ['/api/vision/identificar-prato', 'ia'], ['/api/nutri/classificar', 'ia'], ['/api/onboarding-ia', 'ia'],
    ['/api/gamificacao/sync', 'gamificacao'], ['/api/gamificacao/atividade', 'gamificacao'], ['/api/ranking', 'gamificacao'],
    ['/api/kit', 'kit'], ['/api/kit/interesse', 'kit'], ['/api/planos/vagas', 'fundadores'],
    ['/api/indicacao/codigo', 'embaixadores'], ['/api/indicacao/registrar', 'embaixadores'],
    ['/api/festa/criar', 'modo_festa'], ['/api/festa/entrar', 'modo_festa'], ['/api/festa/carrinho', 'modo_festa'], ['/api/festa/cupons', 'modo_festa'],
    ['/api/flash-sale', 'flash_sale'],
  ]
  for (const [rota, m] of casos) assert.ok(inclui(modulosDaApi(rota), m), `${rota} -> ${m}`)
})

test('APIs: terminar o que começou nunca é bloqueado', () => {
  for (const rota of [
    '/api/cliente/cancelar-pedido', '/api/cliente/privacidade',
    '/api/entregador/confirmar-entrega', '/api/entregador/confirmar-rota', '/api/entregador/desistir-corrida', '/api/entregador/ficar-offline',
    '/api/entregador/stripe-status', '/api/entregador/lojas-delivery', '/api/entregador/festa-oferta',
    '/api/fornecedor/stripe-status', '/api/festa/fechar', '/api/festa/despachar', '/api/festa/estado', '/api/festa/minhas',
    '/api/entrega/watchdog', '/api/entrega/checar-entregador', '/api/entrega/liberar-entregador',
    '/api/loja/cancelar-pedido', '/api/indicacao/desconto', '/api/stripe/webhook', '/api/flags', '/api/publico/cobertura',
  ]) assert.deepEqual(modulosDaApi(rota), [], rota)
})

test('as 12 chaves do admin têm texto na tela de pausa e alguma trava', () => {
  const crescimento = readFileSync(new URL('../../app/lib/crescimento.ts', import.meta.url), 'utf8')
  const chaves = [...crescimento.matchAll(/\{ flag: '([a-z_]+)', rotulo:/g)].map(m => m[1])
  assert.equal(chaves.length, 12)
  const comRegra = new Set([...PAGINAS_MODULO, ...APIS_MODULO].flatMap(r => r.modulos))
  for (const c of chaves) {
    assert.ok(TEXTO_PAUSA[c], `sem texto: ${c}`)
    assert.ok(comRegra.has(c), `sem rota: ${c}`)
  }
})

test('toda API do registro passa pelo matcher do proxy', () => {
  const proxy = readFileSync(new URL('../../proxy.ts', import.meta.url), 'utf8')
  const matcher = proxy.slice(proxy.indexOf('matcher:'))
  const entradas = [...matcher.matchAll(/'([^']+)'/g)].map(m => m[1])
  const coberta = rota => entradas.some(e => {
    const base = e.replace('/:path*', '')
    return rota === base || (e.endsWith('/:path*') && rota.startsWith(base + '/'))
  })
  for (const r of [...PAGINAS_MODULO, ...APIS_MODULO]) assert.ok(coberta(r.rota), `fora do matcher: ${r.rota}`)
  for (const rota of Object.keys(LOGINS_MODULO)) assert.ok(coberta(rota), `fora do matcher: ${rota}`)
})

const L = (flag, cidade_slug, ativo) => ({ flag, cidade_slug, ativo })

test('estado: sem linha é ligado; só o global desliga chave de papel', () => {
  assert.equal(chaveDesligada([], 'cliente'), false)
  assert.equal(chaveDesligada([L('cliente', '__global__', true)], 'cliente'), false)
  assert.equal(chaveDesligada([L('entregador', '__global__', false)], 'entregador'), true)
  assert.equal(chaveDesligada([L('entregador', '__global__', false), L('entregador', 'goiania', true)], 'entregador'), true)
})

test('estado: delivery global OFF com cidade ON continua de pé', () => {
  assert.equal(chaveDesligada([L('delivery', '__global__', false), L('delivery', 'goiania', true)], 'delivery'), false)
  assert.equal(chaveDesligada([L('delivery', '__global__', false), L('delivery', 'goiania', false)], 'delivery'), true)
  assert.equal(chaveDesligada([L('delivery', '__global__', false)], 'delivery'), true)
})

test('mapa público e lista de papéis', () => {
  const m = mapaPublico([L('entregador', '__global__', false)])
  assert.equal(m.entregador, false)
  assert.equal(m.cliente, true)
  assert.equal(listaPapeis(m), 'comerciantes e clientes')
  assert.equal(listaPapeis({}), 'comerciantes, clientes e entregadores')
  assert.equal(listaPapeis({ cliente: false, entregador: false }), 'comerciantes')
})
