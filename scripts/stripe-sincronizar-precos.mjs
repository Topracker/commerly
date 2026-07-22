// ============================================================================
// Sincroniza os preços da mensalidade na Stripe com o que o código manda.
// ----------------------------------------------------------------------------
// Faz por CLI o mesmo que app/lib/stripeMensalidade.ts faz no checkout: procura
// o Price pela lookup_key, confere o valor e, se divergir, cria um Price novo
// transferindo a lookup_key para ele. Price da Stripe é imutável — "mudar o
// preço" é sempre criar outro objeto.
//
// Os valores NÃO são digitados aqui: saem de app/lib/precos.ts por leitura do
// arquivo, para não existir uma segunda fonte de verdade que saia do ar.
//
// Uso (a chave nunca é lida de arquivo commitado):
//   STRIPE_SECRET_KEY=sk_live_xxx node scripts/stripe-sincronizar-precos.mjs
//   STRIPE_SECRET_KEY=sk_live_xxx node scripts/stripe-sincronizar-precos.mjs --dry
// ============================================================================
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const Stripe = createRequire(import.meta.url)(path.join(raiz, 'node_modules/stripe'))

const chave = process.env.STRIPE_SECRET_KEY
if (!chave) {
  console.error('Faltou STRIPE_SECRET_KEY no ambiente.')
  process.exit(1)
}
const dry = process.argv.includes('--dry')

// --- valores vindos de app/lib/precos.ts ------------------------------------
const fonte = fs.readFileSync(path.join(raiz, 'app/lib/precos.ts'), 'utf8')
function constante(nome) {
  const m = new RegExp(`export const ${nome} = ([0-9.]+)`).exec(fonte)
  if (!m) throw new Error(`Não achei ${nome} em app/lib/precos.ts`)
  return Number(m[1])
}
const TIERS = [
  { tier: 'normal', lookup: 'commerly_mensal_normal', nome: 'Commerly — Mensalidade', valor: constante('PRECO_NORMAL'), env: 'STRIPE_PRICE_NORMAL' },
  { tier: 'fundador', lookup: 'commerly_mensal_fundador', nome: 'Commerly — Mensalidade (Fundador)', valor: constante('PRECO_FUNDADOR'), env: 'STRIPE_PRICE_FUNDADOR' },
]

const stripe = new Stripe(chave)
const brl = c => (c / 100).toFixed(2).replace('.', ',')

for (const t of TIERS) {
  const alvo = Math.round(t.valor * 100)
  const { data } = await stripe.prices.list({ lookup_keys: [t.lookup], active: true, limit: 1 })
  const atual = data[0] ?? null

  if (atual && atual.unit_amount === alvo && atual.currency === 'brl' && atual.recurring?.interval === 'month') {
    console.log(`✓ ${t.tier}: já está R$ ${brl(alvo)} (${atual.id})`)
    continue
  }

  const de = atual ? `R$ ${brl(atual.unit_amount)} (${atual.id})` : `sem price com lookup_key ${t.lookup}`
  console.log(`→ ${t.tier}: ${de} → R$ ${brl(alvo)}`)
  if (dry) continue

  // Produto: o do price atual; senão o do price apontado pela env; senão cria.
  let produto = atual ? (typeof atual.product === 'string' ? atual.product : atual.product.id) : null
  if (!produto && process.env[t.env]) {
    try {
      const p = await stripe.prices.retrieve(process.env[t.env])
      produto = typeof p.product === 'string' ? p.product : p.product.id
    } catch { /* env aponta para price morto */ }
  }
  if (!produto) produto = (await stripe.products.create({ name: t.nome })).id

  const novo = await stripe.prices.create({
    currency: 'brl',
    unit_amount: alvo,
    recurring: { interval: 'month' },
    product: produto,
    lookup_key: t.lookup,
    transfer_lookup_key: true,
    nickname: `${t.nome} · ${(alvo / 100).toFixed(2)}`,
  })
  console.log(`  criado ${novo.id} com a lookup_key ${t.lookup}`)
}

console.log(dry ? '\n(dry run — nada foi criado)' : '\nPronto. Assinaturas existentes seguem no price antigo; novas assinaturas usam o novo.')
