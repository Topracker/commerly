// Testes do cupom no Modo Festa (sql/2026-09-20-cupom-modo-festa.sql) contra o
// banco de PRODUÇÃO, com JWT REAL (regra 12: set_config('role') não aplica RLS).
//
// Como rodar:
//   node scripts/testar-cupom-festa.mjs            # só a parte A (REST direto)
//   APP=http://localhost:3000 node scripts/testar-cupom-festa.mjs   # A + B (fluxo pelo app)
//
// Parte A — segurança pela REST do Supabase (sem app):
//   cliente não altera cupom, não chama as RPCs, não mexe em lojas.aceita_cupom;
//   comerciante liga o toggle só na própria loja; leituras por RLS funcionam.
// Parte B — fluxo real pelo app (precisa de `npm run dev`): festa com a Burger
//   House, cupom fixo de R$5, prévia, fechamento com cupom, total abatido,
//   cupom_usos, cancelamento devolve o cupom com validade estendida.
//
// Tudo que é criado (cupom, festa, pedidos, notificações) é apagado no finally.
// Senhas das contas de teste: memória conta_teste_comerciante.md.
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
}
const LOJA_BURGER = '36d99f1f-07c7-4dae-ad97-15765bb62533'   // Burger House (matheus@teste.com)
const LOJA_OUTRA = 'b0cb694f-e0fc-4155-90d9-e8c665021728'    // Brasa Burger (outro dono)

const asserts = []
function ok(cond, msg, extra) { asserts.push({ ok: !!cond, msg }); console.log((cond ? '  ✅ ' : '  ❌ ') + msg + (cond ? '' : '  → ' + JSON.stringify(extra ?? ''))) }
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

const TS = Date.now().toString(36).toUpperCase()
let cupomId = null, festaId = null, clienteId = null, aceitaAntes = null
const pedidosCriados = []

try {
  fase('Login com JWT real')
  const sCli = await login(CONTAS.cliente)
  const sLoja = await login(CONTAS.loja)
  ok(sCli.access_token && sLoja.access_token, 'cliente e comerciante logados')

  const { data: cli } = await admin.from('clientes').select('id').eq('user_id', sCli.user.id).single()
  clienteId = cli.id

  const { data: lojaRow } = await admin.from('lojas').select('aceita_cupom').eq('id', LOJA_BURGER).single()
  aceitaAntes = lojaRow.aceita_cupom

  // Cupom temporário da plataforma (R$5 fixo) para o cliente de teste.
  const { data: cupom, error: ce } = await admin.from('cupons').insert({
    codigo: `DESCULPA-T${TS}`, loja_id: null, cliente_id: clienteId, tipo: 'valor', valor: 5, minimo: 0,
    origem: 'garantia', expira_em: new Date(Date.now() + 3 * 86_400_000).toISOString(),
  }).select('id, expira_em').single()
  if (ce) throw ce
  cupomId = cupom.id

  // ───────────────────────── PARTE A ─────────────────────────
  fase('A1. Cliente lê os próprios cupons, mas não escreve')
  let r = await rest(sCli.access_token, 'GET', `cupons?id=eq.${cupomId}&select=id,usado_em`)
  ok(r.status === 200 && r.body?.length === 1, 'cliente vê o próprio cupom (RLS select)', r)
  r = await rest(sCli.access_token, 'PATCH', `cupons?id=eq.${cupomId}`, { usado_em: null, valor: 500 })
  ok(r.status === 200 && Array.isArray(r.body) && r.body.length === 0, 'PATCH cupons pelo cliente → 0 linhas', r)
  const { data: c1 } = await admin.from('cupons').select('valor').eq('id', cupomId).single()
  ok(Number(c1.valor) === 5, 'valor do cupom intacto no banco', c1)
  r = await rest(sCli.access_token, 'GET', `cupom_usos?select=id&limit=1`)
  ok(r.status === 200 && Array.isArray(r.body), 'cliente lê cupom_usos (vazio, sem erro)', r)

  fase('A2. RPCs só do service role')
  r = await rest(sCli.access_token, 'POST', 'rpc/aplicar_cupom_festa', { p_festa_id: cupomId, p_cupom_id: cupomId, p_cliente_id: clienteId })
  ok(r.status === 401 || r.status === 403 || r.status === 404, `rpc/aplicar_cupom_festa pelo cliente barrada (HTTP ${r.status})`, r)
  r = await rest(sCli.access_token, 'POST', 'rpc/festa_cupom_previa', { p_festa_id: cupomId, p_cupom_id: cupomId, p_cliente_id: clienteId })
  ok(r.status === 401 || r.status === 403 || r.status === 404, `rpc/festa_cupom_previa pelo cliente barrada (HTTP ${r.status})`, r)
  r = await rest(sCli.access_token, 'POST', 'rpc/ratear_centavos', { p_total: 500, p_bases: [6000, 4000] })
  ok(r.status === 401 || r.status === 403 || r.status === 404, `rpc/ratear_centavos pelo cliente barrada (HTTP ${r.status})`, r)
  r = await rest(sLoja.access_token, 'POST', 'rpc/aplicar_cupom_festa', { p_festa_id: cupomId, p_cupom_id: cupomId, p_cliente_id: clienteId })
  ok(r.status === 401 || r.status === 403 || r.status === 404, `rpc/aplicar_cupom_festa pelo comerciante barrada (HTTP ${r.status})`, r)
  const { data: cAposRpc } = await admin.from('cupons').select('usado_em').eq('id', cupomId).single()
  ok(cAposRpc.usado_em === null, 'cupom continua não usado', cAposRpc)

  fase('A3. Toggle aceita_cupom: só o dono, só na própria loja')
  r = await rest(sLoja.access_token, 'PATCH', `lojas?id=eq.${LOJA_BURGER}&select=id,aceita_cupom`, { aceita_cupom: true })
  ok(r.status === 200 && r.body?.length === 1 && r.body[0].aceita_cupom === true, 'comerciante liga o toggle na própria loja (1 linha)', r)
  r = await rest(sLoja.access_token, 'PATCH', `lojas?id=eq.${LOJA_OUTRA}&select=id`, { aceita_cupom: true })
  ok(r.status === 200 && Array.isArray(r.body) && r.body.length === 0, 'comerciante NÃO altera outra loja (0 linhas)', r)
  r = await rest(sCli.access_token, 'PATCH', `lojas?id=eq.${LOJA_BURGER}&select=id`, { aceita_cupom: false })
  ok(r.status === 200 && Array.isArray(r.body) && r.body.length === 0, 'cliente NÃO altera lojas (0 linhas)', r)
  const { data: outra } = await admin.from('lojas').select('aceita_cupom').eq('id', LOJA_OUTRA).single()
  ok(outra.aceita_cupom === false, 'outra loja segue com aceita_cupom=false', outra)

  // ───────────────────────── PARTE B ─────────────────────────
  if (!APP) {
    console.log('\n(Parte B pulada: defina APP=http://localhost:3000 com o dev server rodando.)')
  } else {
    fase('B1. Festa pelo app com a Burger House (aceita cupom)')
    const cookie = cookieDaSessao(sCli)
    const { data: lojaB } = await admin.from('lojas').select('latitude, longitude').eq('id', LOJA_BURGER).single()
    let a = await api(cookie, '/api/festa/criar', { method: 'POST', body: JSON.stringify({
      nome: `Teste cupom ${TS}`, endereco_entrega: 'Rua de teste, 1', entrega_latitude: lojaB.latitude + 0.002, entrega_longitude: lojaB.longitude + 0.002,
      loja_ids: [LOJA_BURGER],
    }) })
    ok(a.status === 200 && a.body?.festa?.id, 'festa criada', a)
    festaId = a.body?.festa?.id
    if (!festaId) throw new Error('sem festa')

    a = await api(cookie, '/api/cliente/lojas?id=' + LOJA_BURGER)
    ok(a.status === 200 && a.body?.loja?.aceita_cupom === true, '/api/cliente/lojas expõe aceita_cupom', a.body?.loja)

    const { data: prod } = await admin.from('produtos').select('id, preco_venda').eq('loja_id', LOJA_BURGER).gt('quantidade', 0).order('preco_venda', { ascending: false }).limit(1).single()
    a = await api(cookie, '/api/festa/carrinho', { method: 'POST', body: JSON.stringify({ festa_id: festaId, itens: [{ produto_id: prod.id, quantidade: 2 }], pronto: true }) })
    ok(a.status === 200 && a.body?.subtotal > 0, 'carrinho salvo', a)

    fase('B2. Prévia do cupom')
    a = await api(cookie, `/api/festa/cupons?festa_id=${festaId}`)
    const meu = (a.body?.cupons || []).find(c => c.id === cupomId)
    ok(a.status === 200 && meu, '/api/festa/cupons lista o cupom', a)
    ok(meu?.previa?.ok === true && Number(meu.previa.desconto_total) === 5 && meu.previa.parcial === false, 'prévia: R$5, sem loja ignorada', meu?.previa)

    fase('B3. Fechar com cupom')
    a = await api(cookie, '/api/festa/fechar', { method: 'POST', body: JSON.stringify({ festa_id: festaId, cupom_id: cupomId }) })
    ok(a.status === 200 && a.body?.cupom?.ok && Number(a.body.cupom.desconto_total) === 5, 'fechou com cupom de R$5', a)
    const { data: peds } = await admin.from('pedidos_clientes').select('id, total, taxa_entrega, desconto_cupom, cupom_id, status').eq('festa_id', festaId)
    for (const p of peds || []) pedidosCriados.push(p.id)
    const p0 = peds?.[0]
    ok(peds?.length === 1 && Number(p0.desconto_cupom) === 5 && p0.cupom_id === cupomId, 'pedido com desconto_cupom=5 e cupom_id', peds)
    const { data: usos } = await admin.from('cupom_usos').select('pedido_id, base, desconto, custeado_por, estornado_em').eq('cupom_id', cupomId)
    ok(usos?.length === 1 && Number(usos[0].desconto) === 5 && usos[0].custeado_por === 'plataforma', 'cupom_usos: 1 linha, R$5, plataforma', usos)
    ok(Math.abs(Number(p0.total) - (Number(usos[0].base) + Number(p0.taxa_entrega) - 5)) < 0.005, 'total = base + taxa − 5', { p0, uso: usos[0] })
    const { data: cUsado } = await admin.from('cupons').select('usado_em, festa_id, desconto_aplicado').eq('id', cupomId).single()
    ok(cUsado.usado_em && cUsado.festa_id === festaId && Number(cUsado.desconto_aplicado) === 5, 'cupom consumido (usado_em, festa_id, desconto_aplicado)', cUsado)

    fase('B4. Guard congela o total pelo cliente (JWT)')
    r = await rest(sCli.access_token, 'PATCH', `pedidos_clientes?id=eq.${p0.id}&select=id,total`, { total: 1, desconto_cupom: 99 })
    const { data: pDepois } = await admin.from('pedidos_clientes').select('total, desconto_cupom').eq('id', p0.id).single()
    ok(Number(pDepois.total) === Number(p0.total) && Number(pDepois.desconto_cupom) === 5, 'total/desconto inalterados após PATCH do cliente', { r, pDepois })

    fase('B5. Reuso e cancelamento')
    a = await api(cookie, '/api/festa/fechar', { method: 'POST', body: JSON.stringify({ festa_id: festaId, cupom_id: cupomId }) })
    ok(a.status === 409, 'fechar de novo → 409 (festa já fechada)', a)
    const expiraAntes = new Date(cupom.expira_em).getTime()
    await new Promise(res => setTimeout(res, 1500))
    const { error: cancErr } = await admin.from('pedidos_clientes').update({ status: 'cancelado' }).eq('id', p0.id)
    ok(!cancErr, 'pedido cancelado (service role)', cancErr)
    const { data: cVolta } = await admin.from('cupons').select('usado_em, festa_id, desconto_aplicado, expira_em').eq('id', cupomId).single()
    ok(cVolta.usado_em === null && cVolta.festa_id === null && cVolta.desconto_aplicado === null, 'cupom voltou (usado_em/festa_id/desconto_aplicado nulos)', cVolta)
    ok(new Date(cVolta.expira_em).getTime() > expiraAntes, 'validade estendida pelo tempo preso', { antes: cupom.expira_em, depois: cVolta.expira_em })
    const { data: usosDepois } = await admin.from('cupom_usos').select('estornado_em').eq('cupom_id', cupomId)
    ok(usosDepois?.every(u => u.estornado_em), 'cupom_usos marcados como estornados', usosDepois)
    const { data: notif } = await admin.from('notificacoes').select('id').eq('tipo', 'cupom').eq('user_id', sCli.user.id).contains('dados', { cupom_id: cupomId })
    ok(notif?.length === 1, 'cliente notificado "Seu cupom voltou"', notif)
  }
} catch (e) {
  console.error('\n💥 ', e)
  asserts.push({ ok: false, msg: 'exceção: ' + (e?.message || e) })
} finally {
  fase('Limpeza')
  if (pedidosCriados.length) {
    // Notificações da loja ("Novo pedido!") e do cliente (status) apontando para os pedidos de teste.
    for (const pid of pedidosCriados) await admin.from('notificacoes').delete().contains('dados', { pedido_id: pid })
    await admin.from('pedidos_clientes').delete().in('id', pedidosCriados)
  }
  if (festaId) await admin.from('festas').delete().eq('id', festaId)
  if (cupomId) {
    const { data: sCliUser } = await admin.from('clientes').select('user_id').eq('id', clienteId).single()
    if (sCliUser?.user_id) await admin.from('notificacoes').delete().eq('user_id', sCliUser.user_id).contains('dados', { cupom_id: cupomId })
    await admin.from('cupons').delete().eq('id', cupomId)
  }
  if (aceitaAntes !== null) await admin.from('lojas').update({ aceita_cupom: aceitaAntes }).eq('id', LOJA_BURGER)
  console.log('  festa/pedidos/cupom/notificações de teste apagados; aceita_cupom da Burger House restaurado para', aceitaAntes)
  // Pedido de teste mexe em XP/gamificação (não é limpo pela exclusão do pedido).
  if (pedidosCriados.length) {
    const { data: cl } = await admin.from('clientes').select('user_id').eq('id', clienteId).single()
    const { data: lj } = await admin.from('lojas').select('user_id').eq('id', LOJA_BURGER).single()
    for (const uid of [cl?.user_id, lj?.user_id].filter(Boolean)) {
      const { error } = await admin.rpc('recalcular_xp', { p_user_id: uid })
      console.log('  recalcular_xp', uid, error ? error.message : 'ok')
    }
  }
  const falhas = asserts.filter(a => !a.ok)
  console.log(`\n${asserts.length - falhas.length}/${asserts.length} asserções OK` + (falhas.length ? ' — FALHAS: ' + falhas.map(f => f.msg).join(' | ') : ''))
  process.exit(falhas.length ? 1 : 0)
}
