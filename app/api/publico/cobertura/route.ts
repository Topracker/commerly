import { NextResponse } from 'next/server'
import { createAdminClient } from '../../../lib/supabase-admin'

export const runtime = 'nodejs'

// Onde o delivery está aberto hoje — lido das feature flags, nunca de uma lista
// fixa no código. Abrir uma cidade nova é ligar a flag `delivery` para ela no
// /admin; esta rota (e o banner que a consome) passam a refleti-la sozinhos.
//
//   { global: true,  cidades: [] }        -> liberado em todo lugar (sem banner)
//   { global: false, cidades: [{...}] }   -> só nas cidades listadas
//
// A flag `delivery` com cidade_slug '__global__' é o padrão; linhas por cidade
// sobrescrevem. Sem nenhuma linha, `getFlags` assume tudo ligado — então
// "global: true" também é o comportamento de um banco sem configuração.

const GLOBAL = '__global__'

export async function GET() {
  const admin = createAdminClient()

  const { data: flags, error } = await admin
    .from('feature_flags').select('cidade_slug, ativo').eq('flag', 'delivery')

  if (error) {
    // Falha de leitura não pode virar "estamos fechados": o banner some e o
    // app segue normal. Errar para o lado permissivo aqui é só cosmético — o
    // bloqueio de verdade acontece no checkout, que relê a flag.
    console.error('[publico/cobertura] erro ao ler flags:', error.message)
    return NextResponse.json({ global: true, cidades: [] })
  }

  const linhas = flags || []
  const linhaGlobal = linhas.find(f => f.cidade_slug === GLOBAL)
  const global = linhaGlobal ? !!linhaGlobal.ativo : true

  if (global) return NextResponse.json({ global: true, cidades: [] },
    { headers: { 'Cache-Control': 'public, max-age=300, s-maxage=300' } })

  const slugs = linhas.filter(f => f.cidade_slug !== GLOBAL && f.ativo).map(f => f.cidade_slug as string)
  if (slugs.length === 0) {
    return NextResponse.json({ global: false, cidades: [] },
      { headers: { 'Cache-Control': 'public, max-age=300, s-maxage=300' } })
  }

  // Nome bonito vem de cidades_expansao; se a cidade não estiver lá, o slug
  // vira rótulo legível ("aparecida-de-goiania" -> "Aparecida De Goiania").
  const { data: cidades } = await admin
    .from('cidades_expansao').select('slug, nome, uf').in('slug', slugs)
  const porSlug = new Map((cidades || []).map(c => [c.slug as string, c]))

  return NextResponse.json({
    global: false,
    cidades: slugs.map(slug => {
      const c = porSlug.get(slug)
      return {
        slug,
        nome: c?.nome || slug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        uf: c?.uf || null,
      }
    }),
  }, { headers: { 'Cache-Control': 'public, max-age=300, s-maxage=300' } })
}
