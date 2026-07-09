// Cria o produto "Commerly Ads" no Stripe com preço recorrente de R$ 49,90/mês
// (BRL) e grava o price_id gerado como STRIPE_PRICE_ADS no .env.local.
//
// Por que um script e não um comando avulso: o price_id precisa ir para o
// .env.local (git-ignored) E para a Vercel. O script imprime o id no fim para
// você colar no painel da Vercel.
//
// Idempotente: se já existir um produto ativo chamado "Commerly Ads" com um
// preço recorrente mensal de R$49,90 em BRL, reusa em vez de duplicar. Criar
// dois preços iguais no Stripe é fácil e chato de desfazer (preço não se apaga,
// só se arquiva).
//
// Uso:
//   node scripts/criar-price-ads.mjs            # cria (ou reusa) e grava no .env.local
//   node scripts/criar-price-ads.mjs --dry-run  # só mostra o que faria
//
// Lê STRIPE_SECRET_KEY de .env.local. Precisa que a chave esteja lá antes.

import { readFileSync, writeFileSync } from 'fs'
import Stripe from 'stripe'

const DRY = process.argv.includes('--dry-run')

const NOME_PRODUTO = 'Commerly Ads'
const VALOR_CENTAVOS = 4990 // R$ 49,90
const MOEDA = 'brl'
const CHAVE_ENV = 'STRIPE_PRICE_ADS'

const envPath = new URL('../.env.local', import.meta.url)
let env
try {
  env = readFileSync(envPath, 'utf8')
} catch {
  console.error('✗ .env.local não encontrado.')
  process.exit(1)
}

const get = (k) => {
  const m = env.match(new RegExp(`^${k}=(.*)$`, 'm'))
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : null
}

const secret = get('STRIPE_SECRET_KEY')
if (!secret) {
  console.error('✗ STRIPE_SECRET_KEY não está no .env.local.')
  console.error('  Pegue em https://dashboard.stripe.com/apikeys e adicione:')
  console.error('  STRIPE_SECRET_KEY=sk_live_... (ou sk_test_... para testar)')
  process.exit(1)
}
if (get(CHAVE_ENV)) {
  console.error(`✗ ${CHAVE_ENV} já existe no .env.local: ${get(CHAVE_ENV)}`)
  console.error('  Apague a linha se quiser gerar um preço novo.')
  process.exit(1)
}

const stripe = new Stripe(secret)
const modo = secret.startsWith('sk_live') ? 'LIVE' : 'TEST'
console.log(`Stripe em modo ${modo}.`)

/** Procura um preço mensal de R$49,90 num produto já existente com esse nome. */
async function acharExistente() {
  const produtos = await stripe.products.search({
    query: `active:'true' AND name:'${NOME_PRODUTO}'`,
    limit: 10,
  })
  for (const produto of produtos.data) {
    const precos = await stripe.prices.list({ product: produto.id, active: true, limit: 100 })
    const preco = precos.data.find(
      (p) =>
        p.currency === MOEDA &&
        p.unit_amount === VALOR_CENTAVOS &&
        p.recurring?.interval === 'month' &&
        p.recurring?.interval_count === 1,
    )
    if (preco) return { produto, preco }
  }
  return null
}

const existente = await acharExistente()
if (existente) {
  console.log(`↺ Já existe: produto ${existente.produto.id}, preço ${existente.preco.id}`)
}

let priceId
if (existente) {
  priceId = existente.preco.id
} else if (DRY) {
  console.log(`[dry-run] Criaria o produto "${NOME_PRODUTO}" e um preço de R$49,90/mês em BRL.`)
  process.exit(0)
} else {
  const produto = await stripe.products.create({
    name: NOME_PRODUTO,
    description: 'Destaque da sua loja na busca do Commerly.',
  })
  const preco = await stripe.prices.create({
    product: produto.id,
    currency: MOEDA,
    unit_amount: VALOR_CENTAVOS,
    recurring: { interval: 'month' },
  })
  priceId = preco.id
  console.log(`✓ Produto criado: ${produto.id}`)
  console.log(`✓ Preço criado:  ${priceId}`)
}

if (DRY) {
  console.log(`[dry-run] Gravaria ${CHAVE_ENV}=${priceId} no .env.local.`)
  process.exit(0)
}

// Acrescenta no fim do .env.local, preservando o resto do arquivo.
const sufixo = env.endsWith('\n') ? '' : '\n'
writeFileSync(envPath, `${env}${sufixo}${CHAVE_ENV}=${priceId}\n`, 'utf8')
console.log(`✓ ${CHAVE_ENV}=${priceId} gravado no .env.local`)

console.log('')
console.log('Faltam dois passos que este script NÃO faz:')
console.log(`  1. Adicione ${CHAVE_ENV}=${priceId} nas env vars da Vercel (o .env.local não sobe pro git).`)
console.log('  2. Ative um método de pagamento em BRL na conta Stripe, senão o Checkout do Ads falha.')
console.log('     https://dashboard.stripe.com/settings/payment_methods')
