const store = new Map<string, { count: number; resetAt: number }>()

export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  if (store.size > 5000) {
    const now = Date.now()
    for (const [k, v] of store) {
      if (now > v.resetAt) store.delete(k)
    }
  }

  const now = Date.now()
  const entry = store.get(key)

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }

  if (entry.count >= limit) return false
  entry.count++
  return true
}
