import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '../../../lib/supabase-admin'
import { rateLimit } from '../../../lib/rate-limit'
import { slugify } from '../../../lib/crescimento'

export const runtime = 'nodejs'

// Lista de espera / "quero trazer a Commerly pra minha cidade". Público.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const email = String(body?.email || '').trim().toLowerCase()
  const cidadeNome = String(body?.cidade_nome || '').trim()
  const uf = String(body?.uf || '').trim().toUpperCase().slice(0, 2)
  const nome = String(body?.nome || '').trim().slice(0, 80) || null
  const papel = ['cliente', 'comerciante', 'entregador'].includes(body?.papel) ? body.papel : 'cliente'

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: 'Informe um e-mail válido.' }, { status: 400 })
  }
  if (cidadeNome.length < 2) {
    return NextResponse.json({ error: 'Informe a sua cidade.' }, { status: 400 })
  }
  if (!rateLimit(`interesse:${email}`, 5, 60_000)) {
    return NextResponse.json({ error: 'Muitas tentativas. Aguarde um instante.' }, { status: 429 })
  }

  const admin = createAdminClient()
  const slug = String(body?.cidade_slug || slugify(cidadeNome))

  const { error } = await admin.from('expansao_interesse').insert({
    cidade_slug: slug, cidade_nome: cidadeNome, uf: uf || null, email, nome, papel,
  })
  if (error) {
    console.error('[expansao/interesse] erro:', error.message)
    return NextResponse.json({ error: 'Não foi possível registrar. Tente de novo.' }, { status: 500 })
  }

  // Quantas pessoas já querem essa cidade (posição na lista de espera).
  const { count } = await admin
    .from('expansao_interesse').select('id', { count: 'exact', head: true }).eq('cidade_slug', slug)

  return NextResponse.json({ ok: true, posicao: count || 1 })
}
