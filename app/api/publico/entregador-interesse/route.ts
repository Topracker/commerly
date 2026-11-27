import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '../../../lib/supabase-admin'
import { rateLimit } from '../../../lib/rate-limit'
import { slugify } from '../../../lib/crescimento'
import { normalizarCodigo } from '../../../lib/festas'

export const runtime = 'nodejs'

// Lista de espera de entregadores (/entregador/em-breve).
//
// NÃO cria conta nem perfil de entregador: só grava o interesse em
// `entregadores_interessados` (RLS sem policy — só o service role escreve).
// Funciona com a chave `entregador` desligada de propósito: é o recrutamento
// que roda ANTES do bairro abrir. O admin vê a contagem por bairro ao lado da
// flag de delivery (Cidades & Flags).
//
// Telefone é a chave: o mesmo número reenviando o formulário atualiza a linha.

/** Só dígitos, sem o 55 do Brasil: 10 (fixo) ou 11 (celular) dígitos. */
function telefoneLimpo(bruto: unknown): string | null {
  let d = String(bruto ?? '').replace(/\D/g, '')
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2)
  return d.length === 10 || d.length === 11 ? d : null
}

function texto(bruto: unknown, max: number): string {
  return String(bruto ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'sem-ip'
  if (!rateLimit(`entregador-interesse:${ip}`, 8, 10 * 60_000)) {
    return NextResponse.json({ error: 'Muitos envios. Aguarde alguns minutos.' }, { status: 429 })
  }

  const body = await req.json().catch(() => ({} as Record<string, unknown>))
  const nome = texto(body.nome, 120)
  const telefone = telefoneLimpo(body.telefone)
  const cidade = texto(body.cidade, 80)
  const bairro = texto(body.bairro, 80)
  const temMoto = body.tem_moto
  const temCnh = body.tem_cnh

  if (nome.length < 2) return NextResponse.json({ error: 'Informe seu nome.' }, { status: 400 })
  if (!telefone) return NextResponse.json({ error: 'Informe um WhatsApp com DDD (ex.: 62 99999-9999).' }, { status: 400 })
  if (cidade.length < 2 || !slugify(cidade)) return NextResponse.json({ error: 'Informe sua cidade.' }, { status: 400 })
  if (bairro.length < 2 || !slugify(bairro)) return NextResponse.json({ error: 'Informe o bairro onde você roda.' }, { status: 400 })
  if (typeof temMoto !== 'boolean' || typeof temCnh !== 'boolean') {
    return NextResponse.json({ error: 'Responda se tem moto própria e CNH.' }, { status: 400 })
  }

  const codigo = normalizarCodigo(String(body.codigo_indicacao || ''))
  const admin = createAdminClient()
  const { data, error } = await admin.from('entregadores_interessados').upsert({
    nome, telefone,
    cidade, cidade_slug: slugify(cidade),
    bairro, bairro_slug: slugify(bairro),
    tem_moto: temMoto, tem_cnh: temCnh,
    codigo_indicacao: codigo.length >= 4 ? codigo : null,
    origem: texto(body.origem, 40) || null,
    atualizado_em: new Date().toISOString(),
  }, { onConflict: 'telefone' }).select('id').single()

  if (error || !data) {
    console.error('[entregador-interesse] falha ao gravar:', error?.message)
    return NextResponse.json({ error: 'Não foi possível registrar agora. Tente de novo.' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
