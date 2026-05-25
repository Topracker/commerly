import Stripe from 'stripe'

let _stripe: Stripe | null = null

export function getStripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)
  }
  return _stripe
}

// Preços mensais em centavos (BRL)
export const PRECO_FUNDADOR = 2990
export const PRECO_NORMAL = 5499
