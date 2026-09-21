// Testes do pagamento em DINHEIRO (Caminho B) — sql/2026-09-20-acertos-dinheiro.sql
// contra o banco de PRODUÇÃO, com JWT REAL (regra 12: set_config('role') não
// aplica RLS).
//
// Como rodar:
//   node scripts/testar-acertos-dinheiro.mjs                          # só a parte A (REST direto)
//   APP=http://localhost:3000 node scripts/testar-acertos-dinheiro.mjs # A + B (fluxo pelo app)
//
// Parte A — guard + RLS pela REST do Supabase (sem app):
//   cliente não consegue se declarar online/pago; troco < total é recusado;
//   loja não muda pagamento_status pela chave anon; ledger nasce no 'entregue';
//   cada papel lê só as próprias linhas; ninguém escreve/apaga no ledger.
// Parte B — fluxo real pelo app (precisa de `npm run dev`): loja busca
//   entregador → oferta avisa 💵 → entregador aceita → loja avança → entregador
//   confirma com o código → acertos → loja contesta e depois confirma → pago.
//
// LIMPEZA: o ledger é append-only ATÉ para o service role, então este script
// NÃO consegue apagar os pedidos de teste (FK). No fim ele imprime o SQL de
// limpeza para rodar via MCP/SQL Editor (desliga o trigger de imutabilidade só
// dentro da transação). Notificações, ofertas e estado do entregador/loja são
// restaurados aqui mesmo. Senhas: memória conta_teste_comerciante.md.
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const env = Object.fromEntries(
  readFileSync(join(RAIZ, '.env.local'), 'utf8').split(/\r?\n/)
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] })
)
const URL_SB = env.NEXT_PUBLIC_SUPABASE_URL, ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY, SRK = env.SUPABASE_SERVICE_ROLE_KEY
const REF = new URL(URL_SB).host.split('.')[0]
const APP = process.env.APP || null
const admin = createClient(URL_SB, SRK, { auth: { autoRefreshToken: false, persistSession: false } })

const CONTAS = {
  cliente: { email: 'cliente@teste.com', senha: process.env.SENHA_CLIENTE || 'Teste123!' },
  loja: { email: 'matheus@teste.com', senha: process.env.SENHA_LOJA || 'Commerly@2026Xq' },
  entregador: { email: 'entregador@teste.com', senha: process.env.SENHA_ENTREGADOR || 'Teste123!' },
}
const LOJA_BURGER = '36d99f1f-07c7-4dae-ad97-15765bb62533'

const asserts = []
function ok(cond, msg, extra) { asserts.push({ ok: !!cond, msg }); console.log((cond ? '  ✅ ' : '  ❌ ') + msg + (cond ? '' : '  → ' + JSON.stringify(extra ?? '').slice(0, 400))) }
function fase(t) { console.log('\n=== ' + t + ' ===') }

async function login({ email, senha }) {
  const r = await fetch(`${URL_SB}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: senha }),
  })
  const j = await r.json(); if (!r.ok) throw new Error('login ' + email + ': ' + JSON.stringify(j)); return j
}
async function rest(jwt, method, path, body, prefer = 'return=representation') {
  const r = await fetch(`${URL_SB}/rest/v1/${path}`, {
    method,
    headers: { apikey: ANON, Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json', Prefer: prefer },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  let j = null; try { j = await r.json() } catch { /* vazio */ }
  return { status: r.status, body: j }
}
function cookieDaSessao(session) {
  const v = 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url')
  const nome = `sb-${REF}-auth-token`
  if (v.length <= 3180) return `${nome}=${v}`
  const partes = []
  for (let i = 0, n = 0; i < v.length; i += 3180, n++) partes.push(`${nome}.${n}=${v.slice(i, i + 3180)}`)
  return partes.join('; ')
}
async function api(cookie, path, init = {}) {
  const r = await fetch(APP + path, { ...init, redirect: 'manual', headers: { cookie, 'Content-Type': 'application/json', ...(init.headers || {}) } })
  let body = null; try { body = await r.json() } catch { /* html */ }
  return { status: r.status, body }
}
const pedidoBase = (clienteId, prodId, extra = {}) => ({
  loja_id: LOJA_BURGER, cliente_id: clienteId,
  itens: [{ produto_id: prodId, nome: 'x', quantidade: 1, preco: 0.01 }],
  total: 0.01, endereco_entrega: 'Rua Teste Dinheiro, 1', entrega_latitude: -16.68, entrega_longitude: -49.25,
  ...extra,
})

const pedidosCriados = []
let lojaAntes = null, entAntes = null, entId = null

try {
  fase('Login com JWT real (3 papéis)')
  const sCli = await login(CONTAS.cliente)
  const sLoja = await login(CONTAS.loja)
  const sEnt = await login(CONTAS.entregador)
  ok(sCli.access_token && sLoja.access_token && sEnt.access_token, 'cliente, comerciante e entregador logados')

  const { data: cli } = await admin.from('clientes').select('id').eq('user_id', sCli.user.id).single()
  const { data: ent } = await admin.from('entregadores').select('id, disponivel, latitude, longitude, localizacao_at').eq('user_id', sEnt.user.id).single()
  entId = ent.id; entAntes = ent
  const { data: lojaRow } = await admin.from('lojas').select('horario, latitude, longitude').eq('id', LOJA_BURGER).single()
  lojaAntes = lojaRow
  const { data: prod } = await admin.from('produtos').select('id, preco_venda').eq('loja_id', LOJA_BURGER).gt('preco_venda', 0).order('preco_venda').limit(1).single()
  // Loja "sempre aberta" durante o teste (trigger de horário) — restaurado no finally.
  await admin.from('lojas').update({ horario: null }).eq('id', LOJA_BURGER)

  // ───────────────────────── PARTE A ─────────────────────────
  fase('A1. Guard no INSERT: cliente não se declara online/pago; troco vale')
  let r = await rest(sCli.access_token, 'POST', 'pedidos_clientes', pedidoBase(cli.id, prod.id, { pagamento_metodo: 'online', pagamento_status: 'pago', troco_para: 100 }))
  ok(r.status === 201 && r.body?.[0], 'pedido criado pelo cliente (REST)', r)
  const A = r.body?.[0]; if (A) pedidosCriados.push(A.id)
  ok(A?.pagamento_metodo === 'entrega' && A?.pagamento_status === 'pendente', 'forjar online/pago vira entrega/pendente', A)
  ok(Number(A?.troco_para) === 100 && Number(A?.total) > 0.01, `troco_para=100 gravado; total autoritativo (R$ ${A?.total})`, A)

  r = await rest(sCli.access_token, 'POST', 'pedidos_clientes', pedidoBase(cli.id, prod.id, { troco_para: 1 }))
  ok(r.status >= 400 && /troco/i.test(JSON.stringify(r.body)), 'troco_para < total recusado com mensagem de troco', r)
  r = await rest(sCli.access_token, 'POST', 'pedidos_clientes', pedidoBase(cli.id, prod.id, { troco_para: 99999 }))
  ok(r.status >= 400 && /troco/i.test(JSON.stringify(r.body)), 'troco_para absurdo recusado', r)

  fase('A2. Guard no UPDATE: loja (anon) não mexe em pagamento')
  r = await rest(sLoja.access_token, 'PATCH', `pedidos_clientes?id=eq.${A.id}`, { pagamento_status: 'pago', pagamento_corrida: 'pago', troco_para: 5 })
  ok(r.status === 200 && r.body?.[0]?.pagamento_status === 'pendente' && r.body?.[0]?.pagamento_corrida === 'pendente' && Number(r.body?.[0]?.troco_para) === 100,
    'PATCH da loja passa na RLS mas o guard congela pagamento_status/corrida/troco', r)

  fase('A3. Ledger nasce no entregue (service role simula o fluxo)')
  await admin.from('pedidos_clientes').update({ entregador_id: entId }).eq('id', A.id)
  for (const st of ['preparando', 'saiu', 'entregue']) await admin.from('pedidos_clientes').update({ status: st }).eq('id', A.id)
  const { data: A2 } = await admin.from('pedidos_clientes').select('status, pagamento_status, pagamento_corrida, total, taxa_entrega').eq('id', A.id).single()
  ok(A2.status === 'entregue' && A2.pagamento_corrida === 'pago' && A2.pagamento_status === 'pendente', 'entregue em dinheiro: corrida paga, pedido pendente (aguarda loja)', A2)
  const { data: acA } = await admin.from('acertos_dinheiro').select('*').eq('pedido_id', A.id).order('tipo')
  ok(acA?.length === 2 && acA.map(a => a.tipo).join(',') === 'cobranca,repasse_loja', 'ledger: cobranca + repasse_loja', acA)
  const repasseA = acA?.find(a => a.tipo === 'repasse_loja')
  ok(repasseA && Math.abs(Number(repasseA.valor) - (Number(A2.total) - Number(A2.taxa_entrega))) < 0.001, `repasse = total − taxa = R$ ${repasseA?.valor}`, repasseA)

  fase('A4. RLS de leitura por vínculo')
  r = await rest(sLoja.access_token, 'GET', `acertos_dinheiro?pedido_id=eq.${A.id}&select=id,tipo,acertos_confirmacoes(*)`)
  ok(r.status === 200 && r.body?.length === 2, 'loja lê as linhas do pedido dela (embed de confirmações ok)', r)
  r = await rest(sEnt.access_token, 'GET', `acertos_dinheiro?pedido_id=eq.${A.id}&select=id`)
  ok(r.status === 200 && r.body?.length === 2, 'entregador lê as linhas dele', r)
  r = await rest(sCli.access_token, 'GET', `acertos_dinheiro?pedido_id=eq.${A.id}&select=id`)
  ok(r.status === 200 && r.body?.length === 2, 'cliente lê as linhas do pedido dele', r)

  fase('A5. Ninguém escreve no ledger pela chave anon')
  r = await rest(sEnt.access_token, 'PATCH', `acertos_dinheiro?id=eq.${repasseA.id}`, { valor: 0.01 })
  ok(r.status >= 400 || (Array.isArray(r.body) && r.body.length === 0), 'PATCH do entregador → barrado/0 linhas', r)
  r = await rest(sLoja.access_token, 'DELETE', `acertos_dinheiro?id=eq.${repasseA.id}`)
  ok(r.status >= 400 || (Array.isArray(r.body) && r.body.length === 0), 'DELETE da loja → barrado/0 linhas', r)
  r = await rest(sLoja.access_token, 'POST', 'acertos_confirmacoes', { acerto_id: repasseA.id, papel: 'loja', resultado: 'confirmado', origem: 'app' })
  ok(r.status >= 400, `INSERT direto em acertos_confirmacoes pela loja barrado (HTTP ${r.status})`, r)
  const { data: vivo } = await admin.from('acertos_dinheiro').select('valor').eq('id', repasseA.id).single()
  ok(Number(vivo.valor) === Number(repasseA.valor), 'valor do repasse intacto no banco', vivo)
  const { error: eDel } = await admin.from('acertos_dinheiro').delete().eq('id', repasseA.id)
  ok(!!eDel && /append-only/.test(eDel.message), 'até o service role é barrado no DELETE (append-only)', eDel)

  // ───────────────────────── PARTE B ─────────────────────────
  if (!APP) {
    console.log('\n(Parte B pulada: defina APP=http://localhost:3000 com o dev server rodando.)')
  } else {
    const ckLoja = cookieDaSessao(sLoja), ckEnt = cookieDaSessao(sEnt)

    fase('B1. Rota confirmar: só quem recebe confirma')
    const cobrancaA = acA.find(a => a.tipo === 'cobranca')
    let a = await api(ckLoja, '/api/acertos/confirmar', { method: 'POST', body: JSON.stringify({ acerto_id: cobrancaA.id, resultado: 'confirmado' }) })
    ok(a.status === 403, 'loja não confirma a cobrança (para_papel=entregador) → 403', a)
    a = await api(ckEnt, '/api/acertos/confirmar', { method: 'POST', body: JSON.stringify({ acerto_id: repasseA.id, resultado: 'confirmado' }) })
    ok(a.status === 403, 'entregador não confirma o repasse (para_papel=loja) → 403', a)
    a = await api(ckLoja, '/api/acertos/confirmar', { method: 'POST', body: JSON.stringify({ acerto_id: repasseA.id, resultado: 'confirmado' }) })
    ok(a.status === 200 && a.body?.pedido_pago === true, 'loja confirma o repasse → pedido pago', a)
    const { data: A3 } = await admin.from('pedidos_clientes').select('pagamento_status').eq('id', A.id).single()
    ok(A3.pagamento_status === 'pago', 'pagamento_status = pago no banco', A3)
    a = await api(ckLoja, '/api/acertos/confirmar', { method: 'POST', body: JSON.stringify({ acerto_id: repasseA.id, resultado: 'confirmado' }) })
    ok(a.status === 409, 'segunda confirmação → 409', a)
    const { data: nEnt } = await admin.from('notificacoes').select('id, titulo').eq('tipo', 'acerto').eq('user_id', sEnt.user.id).contains('dados', { pedido_id: A.id })
    ok((nEnt || []).length >= 2, 'entregador recebeu "Repasse à loja" e "Repasse confirmado"', nEnt)

    fase('B2. Fluxo completo pelo app: despacho → aceite → código → entregue')
    // Entregador online e a 200 m da loja (pool exige GPS < 5 min).
    await admin.from('entregadores').update({ disponivel: true, latitude: lojaRow.latitude + 0.002, longitude: lojaRow.longitude, localizacao_at: new Date().toISOString() }).eq('id', entId)
    r = await rest(sCli.access_token, 'POST', 'pedidos_clientes', pedidoBase(cli.id, prod.id, { troco_para: 50, endereco_entrega: 'Rua Teste Dinheiro, 2' }))
    const B = r.body?.[0]; if (B) pedidosCriados.push(B.id)
    ok(!!B, 'pedido B criado (troco para R$ 50)', r)

    a = await api(ckLoja, '/api/entrega/buscar-entregador', { method: 'POST', body: JSON.stringify({ pedido_id: B.id }) })
    ok(a.status === 200 && a.body?.oferta?.id, `loja ofertou a corrida (${a.body?.tipo || a.body?.status || ''})`, a)
    const ofertaId = a.body?.oferta?.id
    const { data: nOf } = await admin.from('notificacoes').select('mensagem').eq('tipo', 'corrida_oferta').contains('dados', { oferta_id: ofertaId }).maybeSingle()
    ok(/💵 dinheiro, cobrar R\$ /.test(nOf?.mensagem || '') && /troco para R\$ 50,00/.test(nOf?.mensagem || ''), `push da oferta avisa dinheiro+troco: "${nOf?.mensagem}"`, nOf)
    // Entregador lê o pedido pela RLS da oferta pendente — inclusive troco_para.
    r = await rest(sEnt.access_token, 'GET', `pedidos_clientes?id=eq.${B.id}&select=id,total,troco_para,pagamento_metodo`)
    ok(r.status === 200 && r.body?.[0] && Number(r.body[0].troco_para) === 50, 'entregador ofertado lê total/troco_para do pedido (pedidos_select_oferta)', r)

    a = await api(ckEnt, '/api/entregador/responder-corrida', { method: 'POST', body: JSON.stringify({ oferta_id: ofertaId, resposta: 'aceita' }) })
    ok(a.status === 200 && a.body?.ok, 'entregador aceitou', a)
    r = await rest(sLoja.access_token, 'PATCH', `pedidos_clientes?id=eq.${B.id}`, { status: 'preparando' })
    r = await rest(sLoja.access_token, 'PATCH', `pedidos_clientes?id=eq.${B.id}`, { status: 'saiu' })
    ok(r.status === 200 && r.body?.[0]?.status === 'saiu', 'loja avançou até "saiu"', r)
    r = await rest(sLoja.access_token, 'GET', `pedido_codigos?pedido_id=eq.${B.id}&select=codigo`)
    const codigo = r.body?.[0]?.codigo
    ok(!!codigo, 'loja lê o código de confirmação', r)
    r = await rest(sEnt.access_token, 'GET', `pedido_codigos?pedido_id=eq.${B.id}&select=codigo`)
    ok(r.status === 200 && (r.body || []).length === 0, 'entregador NÃO lê o código (regressão auditoria 09-11)', r)

    a = await api(ckEnt, '/api/entregador/confirmar-entrega', { method: 'POST', body: JSON.stringify({ pedido_id: B.id, codigo }) })
    ok(a.status === 200 && a.body?.dinheiro === true && a.body?.pago === false && Number(a.body?.repasse_loja) > 0, `confirmar-entrega devolve dinheiro/repasse (R$ ${a.body?.repasse_loja})`, a)
    const { data: B2 } = await admin.from('pedidos_clientes').select('status, pagamento_status, pagamento_corrida').eq('id', B.id).single()
    ok(B2.status === 'entregue' && B2.pagamento_corrida === 'pago' && B2.pagamento_status === 'pendente', 'B entregue: corrida paga, pedido pendente', B2)
    const { data: acB } = await admin.from('acertos_dinheiro').select('*').eq('pedido_id', B.id)
    const repasseB = (acB || []).find(x => x.tipo === 'repasse_loja')
    ok(acB?.length === 2 && repasseB, 'ledger do B: 2 linhas', acB)

    fase('B3. Loja contesta e depois confirma')
    a = await api(ckLoja, '/api/acertos/confirmar', { method: 'POST', body: JSON.stringify({ acerto_id: repasseB.id, resultado: 'contestado', observacao: 'teste: veio R$ 5 a menos' }) })
    ok(a.status === 200 && a.body?.resultado === 'contestado', 'contestação registrada', a)
    r = await rest(sLoja.access_token, 'GET', `acertos_confirmacoes?acerto_id=eq.${repasseB.id}&select=resultado,observacao`)
    ok(r.status === 200 && r.body?.some(c => c.resultado === 'contestado' && /R\$ 5/.test(c.observacao || '')), 'loja lê a própria contestação (RLS transitiva)', r)
    const { data: B3 } = await admin.from('pedidos_clientes').select('pagamento_status').eq('id', B.id).single()
    ok(B3.pagamento_status === 'pendente', 'contestado: pedido continua pendente', B3)
    a = await api(ckLoja, '/api/acertos/confirmar', { method: 'POST', body: JSON.stringify({ acerto_id: repasseB.id, resultado: 'confirmado' }) })
    ok(a.status === 200 && a.body?.pedido_pago === true, 'depois de acertar, loja confirma → pago', a)
  }
} catch (e) {
  console.error('\n💥 erro inesperado:', e)
  asserts.push({ ok: false, msg: 'erro inesperado: ' + (e?.message || e) })
} finally {
  fase('Limpeza (o que dá para limpar daqui)')
  if (lojaAntes) await admin.from('lojas').update({ horario: lojaAntes.horario }).eq('id', LOJA_BURGER)
  if (entAntes) await admin.from('entregadores').update({ disponivel: entAntes.disponivel, latitude: entAntes.latitude, longitude: entAntes.longitude, localizacao_at: entAntes.localizacao_at }).eq('id', entId)
  for (const pid of pedidosCriados) {
    await admin.from('notificacoes').delete().contains('dados', { pedido_id: pid })
    const { data: ofs } = await admin.from('corrida_ofertas').select('id').eq('pedido_id', pid)
    for (const o of ofs || []) await admin.from('notificacoes').delete().contains('dados', { oferta_id: o.id })
    await admin.from('corrida_ofertas').delete().eq('pedido_id', pid)
  }
  console.log('Loja e entregador restaurados; notificações e ofertas apagadas.')
  if (pedidosCriados.length) {
    console.log('\nO ledger é append-only: apague os pedidos de teste via SQL (MCP/SQL Editor):\n')
    console.log(`begin;
alter table acertos_dinheiro disable trigger trg_acertos_imutaveis;
alter table acertos_confirmacoes disable trigger trg_acertos_conf_imutaveis;
delete from acertos_confirmacoes where acerto_id in (select id from acertos_dinheiro where pedido_id in (${pedidosCriados.map(p => `'${p}'`).join(',')}));
delete from acertos_dinheiro where pedido_id in (${pedidosCriados.map(p => `'${p}'`).join(',')});
alter table acertos_dinheiro enable trigger trg_acertos_imutaveis;
alter table acertos_confirmacoes enable trigger trg_acertos_conf_imutaveis;
delete from pedidos_clientes where id in (${pedidosCriados.map(p => `'${p}'`).join(',')});
commit;`)
  }
  const falhas = asserts.filter(a => !a.ok)
  console.log(`\n${asserts.length - falhas.length}/${asserts.length} asserções ok${falhas.length ? ' — FALHAS: ' + falhas.map(f => f.msg).join(' | ') : ''}`)
  process.exit(falhas.length ? 1 : 0)
}
