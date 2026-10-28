import type Stripe from 'stripe'

type Ref = string | { id: string } | null | undefined

function idDe(ref: Ref): string | null {
  if (!ref) return null
  return typeof ref === 'string' ? ref : ref.id ?? null
}

/**
 * Id da assinatura de uma fatura. A partir da API 2025-03-31 (e na 2025-11-17
 * que a conta usa) o campo saiu de `invoice.subscription` e foi para
 * `invoice.parent.subscription_details.subscription`. Lemos o novo primeiro e
 * caímos no antigo para eventos de versões anteriores. Sem assinatura → null.
 */
export function idAssinaturaDaFatura(invoice: Stripe.Invoice): string | null {
  // `subscription` não existe mais nos tipos da SDK; lemos os dois campos pela
  // forma, para servir aos eventos das duas versões.
  const fatura = invoice as unknown as {
    parent?: { subscription_details?: { subscription?: Ref } | null } | null
    subscription?: Ref
  }
  return idDe(fatura.parent?.subscription_details?.subscription) ?? idDe(fatura.subscription)
}
