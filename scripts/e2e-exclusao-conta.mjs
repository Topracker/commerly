// E2E do fluxo de exclusão de conta (sql/2026-09-19-excluir-conta.sql +
// /api/conta/*) contra o banco de PRODUÇÃO e um dev server local.
//
// Como rodar:
//   CRON_SECRET=teste-local-exclusao NEXT_PUBLIC_APP_URL=http://localhost:3000 npm run dev
//   node scripts/e2e-exclusao-conta.mjs
//
// Contas TEMPORÁRIAS (@exclusao-teste.dev), criadas e destruídas aqui via
// Admin API. Nenhuma conta real é tocada; a limpeza roda no finally mesmo se
// uma asserção estourar. Sessão real por cookie forjado do @supabase/ssr
// (ver memória "E2E dirigido sem navegador"). Cada papel faz no máximo 3 POSTs
// em /api/conta/excluir — é o rate limit da rota.
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
const APP = 'http://localhost:3000'
const CRON = 'teste-local-exclusao'
const admin = createClient(URL_SB, SRK, { auth: { autoRefreshToken: false, persistSession: false } })

const TS = Date.now().toString(36)
const SENHA = 'Teste!' + TS + 'x9'
const PAPEIS = ['comerciante', 'cliente', 'entregador', 'fornecedor']
const emailDe = p => `exclusao-${TS}-${p}@exclusao-teste.dev`

const asserts = []
function ok(cond, msg, extra) { asserts.push({ ok: !!cond, msg, extra }); console.log((cond ? '  ✅ ' : '  ❌ ') + msg + (cond ? '' : '  → ' + JSON.stringify(extra ?? ''))) }
function fase(t) { console.log('\n=== ' + t + ' ===') }

// Cookie do @supabase/ssr: "base64-" + base64url(JSON) partido a cada 3180.
function cookieDaSessao(session) {
  const v = 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url')
  const nome = `sb-${REF}-auth-token`
  if (v.length <= 3180) return `${nome}=${v}`
  const partes = []
  for (let i = 0, n = 0; i < v.length; i += 3180, n++) partes.push(`${nome}.${n}=${v.slice(i, i + 3180)}`)
  return partes.join('; ')
}
async function login(email) {
  const r = await fetch(`${URL_SB}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: SENHA }),
  })
  const j = await r.json(); if (!r.ok) throw new Error('login: ' + JSON.stringify(j)); return j
}
async function api(cookie, path, init = {}) {
  const r = await fetch(APP + path, { ...init, redirect: 'manual', headers: { cookie, 'Content-Type': 'application/json', ...(init.headers || {}) } })
  let body = null; try { body = await r.json() } catch { /* html/redirect */ }
  return { status: r.status, body, location: r.headers.get('location') }
}

const criado = { users: {}, perfis: {}, pedido: null, produto: null, extraUser: null, extraLoja: null }
const cpfs = { comerciante: '39053344705', cliente: '11144477735', entregador: '52998224725' } // válidos, fictícios
const cnpj = '11222333000181'

try {
  fase('0. Setup — usuários e perfis temporários')
  for (const p of PAPEIS) {
    const { data, error } = await admin.auth.admin.createUser({ email: emailDe(p), password: SENHA, email_confirm: true })
    if (error) throw new Error('createUser ' + p + ': ' + error.message)
    criado.users[p] = data.user.id
  }
  const U = criado.users
  const ins = async (t, row) => { const { data, error } = await admin.from(t).insert(row).select('id').single(); if (error) throw new Error(`insert ${t}: ${error.message}`); return data.id }
  criado.perfis.comerciante = await ins('lojas', { user_id: U.comerciante, nome: 'Loja Teste Exclusão ' + TS, tipo: 'restaurante', documento: cpfs.comerciante, telefone: '62999990000', localizacao: 'Rua Teste, Goiânia', latitude: -16.68, longitude: -49.25, plano: 'inativo', trial_expira_em: new Date(Date.now() + 3 * 864e5).toISOString(), delivery_ativo: true, cidade_slug: 'goiania', uf: 'GO' })
  criado.perfis.cliente = await ins('clientes', { user_id: U.cliente, nome: 'Cliente Teste ' + TS, cpf: cpfs.cliente, telefone: '62999991111' })
  criado.perfis.entregador = await ins('entregadores', { user_id: U.entregador, nome: 'Entregador Teste ' + TS, cpf: cpfs.entregador, telefone: '62999992222', disponivel: true, latitude: -16.68, longitude: -49.25, localizacao_at: new Date().toISOString(), veiculo_tipo: 'moto', aprovacao_status: 'aprovado' })
  criado.perfis.fornecedor = await ins('fornecedores', { user_id: U.fornecedor, nome: 'Fornecedor Teste ' + TS, categoria: 'bebidas', cnpj, telefone: '62999993333' })
  const P = criado.perfis
  criado.produto = await ins('produtos', { loja_id: P.comerciante, nome: 'Produto Teste', preco_venda: 10, quantidade: 50 })

  // Dados satélite por user_id (o que a purga precisa varrer)
  for (const p of PAPEIS) {
    await admin.from('notificacoes').insert({ user_id: U[p], tipo: 'boas_vindas', titulo: 'Oi', mensagem: 'teste' })
    await admin.from('push_subscriptions').insert({ user_id: U[p], endpoint: 'https://push.test/' + TS + p, p256dh: 'x', auth: 'y' })
    await admin.from('xp_usuarios').upsert({ user_id: U[p], papel: p, xp: 10 })
  }
  await admin.from('mensagens_clientes').insert({ loja_id: P.comerciante, cliente_id: P.cliente, remetente: 'cliente', conteudo: 'Oi loja, teste ' + TS })
  await admin.from('pontos_clientes').insert({ cliente_id: P.cliente, loja_id: P.comerciante, pontos: 120, saldo: 120, total_acumulado: 120 })
  // Storage: um arquivo na pasta de cada dono
  for (const [bucket, prefixo] of [['lojas', P.comerciante], ['entregadores', U.entregador], ['avaliacoes', 'loja/' + P.cliente]]) {
    const { error } = await admin.storage.from(bucket).upload(`${prefixo}/teste-${TS}.txt`, new Blob(['teste']), { contentType: 'text/plain' })
    ok(!error, `storage: arquivo criado em ${bucket}/${prefixo}`, error?.message)
  }
  // Pedido em andamento (bloqueio) — INSERT passa pelo guard
  {
    const { data, error } = await admin.from('pedidos_clientes').insert({
      loja_id: P.comerciante, cliente_id: P.cliente, itens: [{ produto_id: criado.produto, quantidade: 2 }],
      endereco_entrega: 'Rua do Cliente, 123, Goiânia', entrega_latitude: -16.69, entrega_longitude: -49.26,
      cliente_nome: 'Cliente Teste', cliente_telefone: '62999991111', observacao: 'portão azul', pagamento_metodo: 'entrega',
    }).select('id, status, total').single()
    if (error) throw new Error('pedido: ' + error.message)
    criado.pedido = data.id
    ok(data.status === 'recebido' && Number(data.total) > 0, `pedido criado (${data.status}, total ${data.total})`)
  }

  const sess = {}; const ck = {}
  for (const p of PAPEIS) { sess[p] = await login(emailDe(p)); ck[p] = cookieDaSessao(sess[p]) }

  fase('1. Pré-checagem e bloqueios')
  {
    const r = await api(ck.comerciante, '/api/conta/excluir')
    ok(r.status === 200 && r.body?.papel === 'comerciante', 'GET loja: papel comerciante', r)
    ok(r.body?.bloqueios?.some(b => b.codigo === 'pedidos_abertos'), 'GET loja: bloqueio pedidos_abertos', r.body?.bloqueios)
    const post = await api(ck.comerciante, '/api/conta/excluir', { method: 'POST', body: JSON.stringify({ email: emailDe('comerciante'), confirmacao: 'EXCLUIR' }) })
    ok(post.status === 409 && post.body?.bloqueios?.length, 'POST loja com pedido aberto → 409', post)
    const rc = await api(ck.cliente, '/api/conta/excluir')
    ok(rc.body?.bloqueios?.some(b => b.codigo === 'pedidos_abertos') && rc.body?.avisos?.pontos_clube === 120, 'GET cliente: bloqueio + aviso 120 pontos', rc.body)
    const errado = await api(ck.entregador, '/api/conta/excluir', { method: 'POST', body: JSON.stringify({ email: 'outro@x.com', confirmacao: 'EXCLUIR' }) })
    ok(errado.status === 400, 'POST com e-mail errado → 400', errado)
    const exp = await fetch(APP + '/api/conta/exportar', { headers: { cookie: ck.comerciante } })
    const pacote = await exp.json()
    ok(exp.status === 200 && pacote?.loja?.id === P.comerciante && pacote?.produtos?.length === 1, 'exportar: JSON da loja com produtos', { status: exp.status, keys: Object.keys(pacote || {}) })
  }

  fase('2. Regressão do guard (service role SEM a GUC)')
  {
    // entregador entra no pedido, pedido vai a 'entregue'
    await admin.from('pedidos_clientes').update({ status: 'preparando', entregador_id: P.entregador }).eq('id', criado.pedido)
    const { data: t1 } = await admin.from('pedidos_clientes').update({ status: 'entregue', cliente_nome: 'HACK', endereco_entrega: 'HACK' }).eq('id', criado.pedido).select('status, cliente_nome, endereco_entrega, entregador_id').single()
    ok(t1?.status === 'entregue' && t1?.cliente_nome === 'Cliente Teste' && t1?.endereco_entrega === 'Rua do Cliente, 123, Goiânia', 'status avança; cliente_nome/endereço continuam congelados', t1)
    ok(t1?.entregador_id === P.entregador, 'entregador ficou no pedido', t1)
  }

  fase('3. Solicitar exclusão (4 papéis)')
  const executa = {}
  for (const p of PAPEIS) {
    const r = await api(ck[p], '/api/conta/excluir', { method: 'POST', body: JSON.stringify({ email: emailDe(p), confirmacao: 'excluir' }) })
    executa[p] = r.body?.executa_apos
    const dias = executa[p] ? (new Date(executa[p]) - Date.now()) / 864e5 : 0
    ok(r.status === 200 && r.body?.papel === p && dias > 29.9 && dias < 30.1, `POST ${p} → 200, carência ~30d`, r)
  }
  {
    const { data: lp } = await admin.from('lojas_publicas').select('disponivel').eq('id', P.comerciante).single()
    ok(lp?.disponivel === false, 'lojas_publicas.disponivel = false', lp)
    const { data: e } = await admin.from('entregadores').select('disponivel, latitude').eq('id', P.entregador).single()
    ok(e?.disponivel === false && e?.latitude === null, 'entregador fora do pool e sem GPS', e)
    const { data: fp } = await admin.from('fornecedores_publicos').select('id').eq('id', P.fornecedor)
    ok(fp?.length === 0, 'fornecedor some de fornecedores_publicos', fp)
    const { count } = await admin.from('push_subscriptions').select('*', { count: 'exact', head: true }).in('user_id', Object.values(U))
    ok(count === 0, 'push_subscriptions apagadas na solicitação', count)
    const { data: ex } = await admin.from('exclusoes_conta').select('papel, hash_documento, snapshot').in('user_id', Object.values(U))
    ok(ex?.length === 4 && ex.every(x => x.hash_documento?.length === 64), '4 linhas em exclusoes_conta com hash', ex)
    // A sessão antiga caiu (signOut global na solicitação) — isso é o esperado:
    const velha = await api(ck.fornecedor, '/api/conta/excluir')
    ok(velha.status === 401, 'sessão anterior à solicitação foi derrubada (signOut global)', velha)
    ck.fornecedor = cookieDaSessao(await login(emailDe('fornecedor')))
    const dup = await api(ck.fornecedor, '/api/conta/excluir', { method: 'POST', body: JSON.stringify({ email: emailDe('fornecedor'), confirmacao: 'EXCLUIR' }) })
    ok(dup.status === 409, 'POST de novo → 409 já pendente', dup)
    // Nova sessão para testar o proxy.
    const nova = cookieDaSessao(await login(emailDe('comerciante')))
    ck.comerciante = nova
    const px = await api(nova, '/dashboard')
    ok(px.status === 307 && px.location?.endsWith('/conta/agendada'), 'proxy: /dashboard → /conta/agendada', px)
    const ag = await api(nova, '/conta/agendada')
    ok(ag.status === 200, 'proxy: /conta/agendada libera', ag.status)
    const apiBlq = await api(nova, '/api/loja/stripe-status')
    ok(apiBlq.status === 403 && apiBlq.body?.exclusao === true, 'proxy: API do comerciante → 403 exclusao', apiBlq)
    ck.cliente = cookieDaSessao(await login(emailDe('cliente')))
    const pc = await api(ck.cliente, '/cliente/buscar')
    ok(pc.status === 307 && pc.location?.endsWith('/conta/agendada'), 'proxy: /cliente/buscar → /conta/agendada', pc)
    const { error: prot } = await admin.rpc('solicitar_exclusao_conta', { p_user_id: '00000000-0000-0000-0000-000000000001', p_email: 'matheus@teste.com' })
    ok(prot?.message?.includes('conta_protegida'), 'conta protegida (lista fixa) é recusada no SQL', prot?.message)
  }

  fase('4. Reativar (cliente) e solicitar de novo')
  {
    const r = await api(ck.cliente, '/api/conta/reativar', { method: 'POST' })
    ok(r.status === 200 && r.body?.destino === '/cliente/dashboard', 'reativar cliente → destino', r)
    const { data: c } = await admin.from('clientes').select('exclusao_solicitada_em').eq('id', P.cliente).single()
    ok(c?.exclusao_solicitada_em === null, 'clientes.exclusao_solicitada_em limpo', c)
    const pc = await api(ck.cliente, '/cliente/buscar')
    ok(pc.status === 200, 'proxy libera /cliente/buscar depois de reativar', pc.status)
    const again = await api(ck.cliente, '/api/conta/excluir', { method: 'POST', body: JSON.stringify({ email: emailDe('cliente'), confirmacao: 'EXCLUIR' }) })
    ok(again.status === 200, 'solicitar de novo depois de reativar → 200', again)
    // Loja: reativar restaura delivery_ativo e trial
    const r2 = await api(ck.comerciante, '/api/conta/reativar', { method: 'POST' })
    const { data: l } = await admin.from('lojas').select('delivery_ativo, trial_expira_em, exclusao_solicitada_em').eq('id', P.comerciante).single()
    ok(r2.status === 200 && l?.delivery_ativo === true && l?.trial_expira_em && l?.exclusao_solicitada_em === null, 'reativar loja restaura delivery_ativo + trial', { r2, l })
    const r3 = await api(ck.comerciante, '/api/conta/excluir', { method: 'POST', body: JSON.stringify({ email: emailDe('comerciante'), confirmacao: 'EXCLUIR' }) })
    ok(r3.status === 200, 'loja solicita de novo → 200', r3)
  }

  fase('5. Caminho público: generateLink(recovery) → verificar-recovery → sessão')
  {
    const lp = await fetch(APP + '/api/conta/link-publico', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'ninguem-' + TS + '@exclusao-teste.dev' }) })
    ok(lp.status === 200, 'link-publico para e-mail inexistente → 200 genérico (sem criar usuário)', lp.status)
    const { data: fantasma } = await admin.from('exclusoes_conta').select('id').eq('email', 'ninguem-' + TS + '@exclusao-teste.dev')
    ok(fantasma?.length === 0, 'nenhum registro criado para e-mail inexistente')
    const { data: gl, error: egl } = await admin.auth.admin.generateLink({ type: 'recovery', email: emailDe('fornecedor'), options: { redirectTo: APP + '/conta/excluir' } })
    ok(!egl && gl?.properties?.hashed_token, 'generateLink recovery gerou token', egl?.message)
    const vr = await fetch(APP + '/api/auth/verificar-recovery', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token_hash: gl.properties.hashed_token, type: 'recovery' }) })
    const vj = await vr.json()
    ok(vj?.ok && vj?.session?.access_token, 'verificar-recovery devolveu sessão', vj?.erro)
    // O navegador faz setSession({access_token, refresh_token}) e o GoTrue
    // devolve a sessão completa; aqui trocamos o refresh_token do mesmo jeito.
    const rt = await fetch(`${URL_SB}/auth/v1/token?grant_type=refresh_token`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: vj.session.refresh_token }) })
    const sessaoCompleta = await rt.json()
    ok(rt.status === 200 && sessaoCompleta?.user?.id === U.fornecedor, 'refresh_token do link vira sessão completa do fornecedor', sessaoCompleta?.error)
    const ckPub = cookieDaSessao(sessaoCompleta)
    const g = await api(ckPub, '/api/conta/excluir')
    ok(g.status === 200 && g.body?.papel === 'fornecedor' && g.body?.pendente, 'sessão do link vê a conta (fornecedor, já pendente)', g.body)
  }

  fase('6. Purga (cron) — antecipa a carência dos 4')
  {
    const { data: adiantados } = await admin.from('exclusoes_conta').update({ executa_apos: new Date(Date.now() - 60e3).toISOString() }).in('user_id', Object.values(U)).is('reativado_em', null).select('id')
    ok(adiantados?.length === 4, '4 pedidos com carência vencida', adiantados)
    const semAuth = await fetch(APP + '/api/conta/purgar-cron')
    ok(semAuth.status === 401, 'cron sem segredo → 401', semAuth.status)
    const cron = await fetch(APP + '/api/conta/purgar-cron', { headers: { authorization: 'Bearer ' + CRON } })
    const cj = await cron.json()
    const minhas = (cj?.purgadas || []).filter(x => adiantados.some(a => a.id === x.id))
    ok(cron.status === 200 && minhas.length === 4 && minhas.every(x => x.ok), 'cron purgou os 4', cj)
    console.log('     etapas:', minhas.map(x => x.etapas.join(',')).join(' | '))

    for (const p of PAPEIS) {
      const { data: u } = await admin.auth.admin.getUserById(U[p])
      ok(!u?.user, `auth: usuário ${p} apagado`)
    }
    const { data: loja } = await admin.from('lojas').select('user_id, nome, documento, telefone, latitude, excluido_em, exclusao_solicitada_em').eq('id', P.comerciante).single()
    ok(loja?.user_id === null && loja?.nome === 'Loja removida' && loja?.documento === null && loja?.telefone === null && loja?.latitude === null && loja?.excluido_em, 'tombstone da loja', loja)
    const { data: cli } = await admin.from('clientes').select('user_id, nome, cpf, telefone, excluido_em').eq('id', P.cliente).single()
    ok(cli?.user_id === null && cli?.nome === 'Cliente removido' && cli?.cpf === null, 'tombstone do cliente', cli)
    const { data: ent } = await admin.from('entregadores').select('user_id, nome, cpf, veiculo_tipo, excluido_em').eq('id', P.entregador).single()
    ok(ent?.user_id === null && ent?.nome === 'Entregador removido' && ent?.cpf === null, 'tombstone do entregador', ent)
    const { data: forn } = await admin.from('fornecedores').select('user_id, nome, cnpj, excluido_em').eq('id', P.fornecedor).single()
    ok(forn?.user_id === null && forn?.nome === 'Fornecedor removido' && forn?.cnpj === null, 'tombstone do fornecedor', forn)
    const { data: ped } = await admin.from('pedidos_clientes').select('status, total, cliente_nome, cliente_telefone, endereco_entrega, entrega_latitude, observacao, entregador_id, loja_id, cliente_id').eq('id', criado.pedido).single()
    ok(ped?.status === 'entregue' && Number(ped?.total) > 0 && ped?.cliente_nome === null && ped?.cliente_telefone === null && ped?.endereco_entrega === '[removido]' && ped?.entrega_latitude === null && ped?.observacao === null && ped?.entregador_id === P.entregador, 'pedido FICA (status/total/entregador) e perde quem/onde', ped)
    const { count: prod } = await admin.from('produtos').select('*', { count: 'exact', head: true }).eq('loja_id', P.comerciante)
    ok(prod === 0, 'produtos da loja apagados', prod)
    const { count: notif } = await admin.from('notificacoes').select('*', { count: 'exact', head: true }).in('user_id', Object.values(U))
    const { count: xp } = await admin.from('xp_usuarios').select('*', { count: 'exact', head: true }).in('user_id', Object.values(U))
    ok(notif === 0 && xp === 0, 'notificacoes e xp apagados', { notif, xp })
    const { count: msg } = await admin.from('mensagens_clientes').select('*', { count: 'exact', head: true }).eq('cliente_id', P.cliente)
    ok(msg === 1, 'mensagem FICA para a outra parte (decisão 3)', msg)
    const { count: pts } = await admin.from('pontos_clientes').select('*', { count: 'exact', head: true }).eq('cliente_id', P.cliente)
    ok(pts === 0, 'pontos do cliente apagados', pts)
    for (const [bucket, prefixo] of [['lojas', P.comerciante], ['entregadores', U.entregador], ['avaliacoes', 'loja/' + P.cliente]]) {
      const { data: f } = await admin.storage.from(bucket).list(prefixo)
      ok((f || []).filter(x => x.id).length === 0, `storage ${bucket}/${prefixo} vazio`, f)
    }
    const { data: ex } = await admin.from('exclusoes_conta').select('executado_em, auth_apagado_em, erro').in('user_id', Object.values(U)).is('reativado_em', null)
    ok(ex?.length === 4 && ex.every(x => x.executado_em && x.auth_apagado_em && !x.erro), 'exclusoes_conta: executado + auth apagado, sem erro', ex)
    const cron2 = await fetch(APP + '/api/conta/purgar-cron', { headers: { authorization: 'Bearer ' + CRON } })
    const c2 = await cron2.json()
    ok(cron2.status === 200 && !(c2?.purgadas || []).some(x => adiantados.some(a => a.id === x.id)), 'cron de novo é idempotente (nada a fazer)', c2)
  }

  fase('7. Quarentena: mesmo CPF não ganha trial nem indicação')
  {
    const { data: q } = await admin.rpc('documento_em_quarentena', { p_doc: '390.533.447-05' })
    ok(q === true, 'documento_em_quarentena(CPF da loja excluída) = true', q)
    const { data: nq } = await admin.rpc('documento_em_quarentena', { p_doc: '00000000191' })
    ok(nq === false, 'CPF nunca visto = false', nq)
    // Cadastro como usuário comum (trigger só age em anon/authenticated)
    const { data: nu, error: enu } = await admin.auth.admin.createUser({ email: `exclusao-${TS}-novo@exclusao-teste.dev`, password: SENHA, email_confirm: true })
    if (enu) throw new Error(enu.message)
    criado.extraUser = nu.user.id
    const s = await login(`exclusao-${TS}-novo@exclusao-teste.dev`)
    const cli = createClient(URL_SB, ANON, { global: { headers: { Authorization: 'Bearer ' + s.access_token } }, auth: { persistSession: false, autoRefreshToken: false } })
    const { data: nl, error: enl } = await cli.from('lojas').insert({ user_id: nu.user.id, nome: 'Loja Recriada ' + TS, tipo: 'restaurante', documento: cpfs.comerciante, localizacao: 'Rua X, Goiânia' }).select('id, trial_expira_em').single()
    criado.extraLoja = nl?.id
    const trialMin = nl?.trial_expira_em ? (new Date(nl.trial_expira_em) - Date.now()) / 60e3 : null
    ok(!enl && trialMin !== null && trialMin < 1, `loja recriada com o mesmo CPF nasce SEM trial (trial em ${trialMin?.toFixed(1)} min)`, enl?.message || nl)
  }
} catch (e) {
  console.error('\n💥 ERRO NO TESTE:', e)
  asserts.push({ ok: false, msg: 'exceção: ' + (e?.message || e) })
} finally {
  fase('Limpeza')
  const U = criado.users, P = criado.perfis
  const del = async (t, col, vals) => { if (!vals?.length) return; const { error } = await admin.from(t).delete().in(col, vals); if (error) console.log('   limpeza', t, error.message) }
  if (criado.extraLoja) await del('lojas', 'id', [criado.extraLoja])
  if (criado.pedido) await del('pedidos_clientes', 'id', [criado.pedido])
  await del('pontos_clientes', 'cliente_id', [P.cliente].filter(Boolean))
  await del('mensagens_clientes', 'cliente_id', [P.cliente].filter(Boolean))
  await del('produtos', 'loja_id', [P.comerciante].filter(Boolean))
  await del('lojas', 'id', [P.comerciante].filter(Boolean))
  await del('clientes', 'id', [P.cliente].filter(Boolean))
  await del('entregadores', 'id', [P.entregador].filter(Boolean))
  await del('fornecedores', 'id', [P.fornecedor].filter(Boolean))
  const ids = [...Object.values(U), criado.extraUser].filter(Boolean)
  for (const t of ['notificacoes', 'push_subscriptions', 'xp_usuarios', 'streaks', 'atividade_dias', 'medalhas_usuarios', 'missoes_usuarios', 'exclusoes_conta']) await del(t, 'user_id', ids)
  for (const [bucket, prefixo] of [['lojas', P.comerciante], ['entregadores', U.entregador], ['avaliacoes', 'loja/' + P.cliente]]) {
    if (!prefixo || prefixo.endsWith('undefined')) continue
    const { data: f } = await admin.storage.from(bucket).list(prefixo)
    const paths = (f || []).filter(x => x.id).map(x => `${prefixo}/${x.name}`)
    if (paths.length) await admin.storage.from(bucket).remove(paths)
  }
  for (const id of ids) { const { error } = await admin.auth.admin.deleteUser(id); if (error && !/not found/i.test(error.message)) console.log('   deleteUser', id, error.message) }
  const { data: sobras } = await admin.from('exclusoes_conta').select('id').like('email', `%${TS}%`)
  console.log('   sobras em exclusoes_conta:', sobras?.length ?? '?')
  const falhas = asserts.filter(a => !a.ok)
  console.log(`\nRESULTADO: ${asserts.length - falhas.length}/${asserts.length} asserções OK`)
  if (falhas.length) { console.log('FALHAS:'); falhas.forEach(f => console.log(' -', f.msg)) }
  process.exit(falhas.length ? 1 : 0)
}
