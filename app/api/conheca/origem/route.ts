import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '../../../lib/supabase-admin'
import { rateLimit } from '../../../lib/rate-limit'

// Loga 1 clique de origem (QR do panfleto, link do Instagram, etc.) — público,
// sem auth, só escrita (ninguém lê de volta por aqui). Tabela:
// sql/2026-11-26-conheca-origem.sql (ainda não aplicada).
export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'desconhecido'
  if (!rateLimit(`conheca-origem:${ip}`, 20, 60_000)) {
    return NextResponse.json({ ok: false }, { status: 429 })
  }

  const { origem, pagina } = await request.json().catch(() => ({}))
  if (!origem || typeof origem !== 'string' || origem.length > 60) {
    return NextResponse.json({ ok: false }, { status: 400 })
  }

  const admin = createAdminClient()
  await admin.from('cliques_origem').insert({
    origem,
    pagina: typeof pagina === 'string' ? pagina.slice(0, 120) : null,
  })

  return NextResponse.json({ ok: true })
}
