// Teste funcional ponta-a-ponta dos fluxos, com os MESMOS payloads que o codigo
// envia. Pega uma loja real, insere/le/apaga em cada tabela. Detecta problemas
// que a checagem de coluna nao pega (NOT NULL, defaults, CHECK, FK).
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split(/\r?\n/).filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }),
)
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const log = (...a) => console.log(...a)
let fails = 0
function fail(fluxo, msg) { fails++; log(`[FALHA] ${fluxo}: ${msg}`) }
function ok(fluxo, extra = '') { log(`[OK] ${fluxo} ${extra}`) }

// Precisamos de uma loja real p/ satisfazer FKs/RLS-scope
const { data: lojas, error: lojaErr } = await admin.from('lojas').select('id, nome').limit(1)
if (lojaErr || !lojas?.length) { log('Sem lojas para testar:', lojaErr?.message); process.exit(1) }
const loja = lojas[0]
log(`Loja de teste: ${loja.nome} (${loja.id})\n`)

// ── agenda ──────────────────────────────────────────────────────────────────
// Payload IDENTICO ao de nicheStore.salvarAgendamento (inclui data_hora legado).
{
  const d = '2099-01-01', h = '09:00'
  const payload = { loja_id: loja.id, cliente: '__TESTE__', servico: 'Corte', data: d, hora: h, telefone: '11999999999', obs: 'teste', status: 'agendado', data_hora: `${d} ${h}:00` }
  const { data, error } = await admin.from('agendamentos').insert(payload).select().single()
  if (error) { fail('agenda/insert', `${error.code} ${error.message}`) }
  else {
    // edita (troca status + horario) como a UI faz
    const { error: e2 } = await admin.from('agendamentos')
      .update({ status: 'concluido', hora: '10:00', data_hora: `${d} 10:00:00` })
      .eq('id', data.id)
    if (e2) fail('agenda/update', `${e2.code} ${e2.message}`); else ok('agenda/insert+update')
    await admin.from('agendamentos').delete().eq('id', data.id)
  }
}

// ── servicos ────────────────────────────────────────────────────────────────
{
  const payload = { loja_id: loja.id, nome: '__TESTE__', preco: 50, duracao: 30 }
  const { data, error } = await admin.from('servicos').insert(payload).select().single()
  if (error) fail('servicos/insert', `${error.code} ${error.message}`)
  else { ok('servicos/insert'); await admin.from('servicos').delete().eq('id', data.id) }
}

// ── fiado ───────────────────────────────────────────────────────────────────
{
  const payload = { loja_id: loja.id, cliente_nome: '__TESTE__', descricao: 'fiado teste', valor: 12.5 }
  const { data, error } = await admin.from('fiado').insert(payload).select().single()
  if (error) fail('fiado/insert', `${error.code} ${error.message}`)
  else {
    // testa toggle pago
    const { error: e2 } = await admin.from('fiado').update({ pago: true }).eq('id', data.id)
    if (e2) fail('fiado/update-pago', `${e2.code} ${e2.message}`); else ok('fiado/insert+pago')
    await admin.from('fiado').delete().eq('id', data.id)
  }
}

// ── funcionarios ────────────────────────────────────────────────────────────
{
  const payload = { loja_id: loja.id, nome: '__TESTE__' }
  const { data, error } = await admin.from('funcionarios').insert(payload).select().single()
  if (error) fail('funcionarios/insert', `${error.code} ${error.message}`)
  else { ok('funcionarios/insert'); await admin.from('funcionarios').delete().eq('id', data.id) }
}

// ── fornecedor (busca com join de avaliacoes) ───────────────────────────────
{
  const { error } = await admin
    .from('fornecedores')
    .select('id, nome, categoria, localizacao, descricao, latitude, longitude, avaliacoes_fornecedores(nota)')
    .limit(5)
  if (error) fail('fornecedor/busca-join', `${error.code} ${error.message}`)
  else ok('fornecedor/busca-join')
}

// ── mensagens (comerciante <-> fornecedor) ──────────────────────────────────
{
  const { data: forn } = await admin.from('fornecedores').select('id').limit(1)
  if (!forn?.length) { log('[SKIP] mensagens/fornecedor: sem fornecedores'); }
  else {
    const payload = { loja_id: loja.id, fornecedor_id: forn[0].id, remetente: 'loja', conteudo: '__TESTE__' }
    const { data, error } = await admin.from('mensagens').insert(payload).select().single()
    if (error) fail('mensagens/insert', `${error.code} ${error.message}`)
    else {
      const { error: e2 } = await admin.from('mensagens').update({ lida: true }).eq('id', data.id)
      if (e2) fail('mensagens/update-lida', `${e2.code} ${e2.message}`); else ok('mensagens/insert+lida')
      await admin.from('mensagens').delete().eq('id', data.id)
    }
  }
}

// ── mensagens_clientes (comerciante <-> cliente) ────────────────────────────
{
  const { data: cli } = await admin.from('clientes').select('id').limit(1)
  if (!cli?.length) { log('[SKIP] mensagens/cliente: sem clientes'); }
  else {
    const payload = { loja_id: loja.id, cliente_id: cli[0].id, remetente: 'loja', conteudo: '__TESTE__' }
    const { data, error } = await admin.from('mensagens_clientes').insert(payload).select().single()
    if (error) fail('mensagens_clientes/insert', `${error.code} ${error.message}`)
    else { ok('mensagens_clientes/insert'); await admin.from('mensagens_clientes').delete().eq('id', data.id) }
  }
}

log(`\n==== ${fails === 0 ? 'TODOS OS FLUXOS OK' : fails + ' FALHA(S)'} ====`)
process.exit(0)
