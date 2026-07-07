// Auditoria de schema de producao para os fluxos: agenda, servicos, fiado,
// funcionarios, fornecedor, mensagens. Verifica se cada coluna que o codigo
// le/escreve existe de fato na tabela de producao (via select head-count).
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split(/\r?\n/).filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }),
)
const url = env.NEXT_PUBLIC_SUPABASE_URL
const key = env.SUPABASE_SERVICE_ROLE_KEY
const admin = createClient(url, key, { auth: { persistSession: false } })

// tabela -> colunas que o codigo usa
const CHECKS = {
  agendamentos: ['id', 'loja_id', 'cliente', 'servico', 'data', 'hora', 'telefone', 'obs', 'status', 'created_at'],
  servicos: ['id', 'loja_id', 'nome', 'preco', 'duracao', 'created_at'],
  fiado: ['id', 'loja_id', 'cliente_nome', 'descricao', 'valor', 'pago', 'created_at'],
  funcionarios: ['id', 'loja_id', 'nome', 'created_at'],
  fornecedores: ['id', 'nome', 'categoria', 'localizacao', 'descricao', 'latitude', 'longitude', 'created_at'],
  avaliacoes_fornecedores: ['id', 'fornecedor_id', 'nota', 'created_at'],
  mensagens: ['id', 'loja_id', 'fornecedor_id', 'remetente', 'conteudo', 'lida', 'created_at'],
  mensagens_clientes: ['id', 'loja_id', 'cliente_id', 'remetente', 'conteudo', 'lida', 'created_at'],
  clientes: ['id', 'nome'],
}

async function colExists(table, col) {
  const { error } = await admin.from(table).select(col, { head: true, count: 'exact' }).limit(1)
  if (!error) return { ok: true }
  return { ok: false, code: error.code, msg: error.message }
}

async function tableExists(table) {
  const { error } = await admin.from(table).select('*', { head: true, count: 'exact' }).limit(1)
  if (!error) return { ok: true }
  return { ok: false, code: error.code, msg: error.message }
}

let problems = 0
for (const [table, cols] of Object.entries(CHECKS)) {
  const t = await tableExists(table)
  if (!t.ok) {
    console.log(`\n[TABELA AUSENTE] ${table} -> ${t.code} ${t.msg}`)
    problems++
    continue
  }
  const missing = []
  for (const c of cols) {
    const r = await colExists(table, c)
    if (!r.ok) missing.push(`${c} (${r.code || ''} ${r.msg})`)
  }
  if (missing.length) {
    console.log(`\n[COLUNAS FALTANDO] ${table}:`)
    for (const m of missing) console.log(`   - ${m}`)
    problems += missing.length
  } else {
    console.log(`[OK] ${table} (${cols.length} colunas)`)
  }
}

console.log(`\n==== ${problems === 0 ? 'TUDO OK' : problems + ' problema(s) encontrado(s)'} ====`)
process.exit(0)
