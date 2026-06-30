import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '../../../lib/supabase-admin'
import { rateLimit } from '../../../lib/rate-limit'
import {
  soDigitos,
  formatarCPF,
  formatarCNPJ,
  formatarTelefone,
  type CampoDuplicado,
} from '../../../lib/validacoes'

// Checa se um CPF, CNPJ ou telefone já está em uso por OUTRA conta do
// Commerly (comerciante, cliente ou fornecedor). Roda no server com a
// service role porque a RLS impede o client de enxergar linhas de outros
// usuários — sem isso a checagem de duplicidade sempre passaria.

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const cpf: string = typeof body?.cpf === 'string' ? body.cpf : ''
  const cnpj: string = typeof body?.cnpj === 'string' ? body.cnpj : ''
  const telefone: string = typeof body?.telefone === 'string' ? body.telefone : ''

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 })

  if (!rateLimit(`checar-dup:${user.id}`, 60, 60_000)) {
    return NextResponse.json({ erro: 'Muitas tentativas. Aguarde um momento.' }, { status: 429 })
  }

  const admin = createAdminClient()

  // Procura `variantes` na coluna `col` da tabela `table`, ignorando a própria
  // conta do usuário (caso ele esteja reprocessando o cadastro).
  async function existe(table: string, col: string, variantes: string[]): Promise<boolean> {
    const { data, error } = await admin
      .from(table)
      .select('user_id')
      .in(col, variantes)
      .neq('user_id', user!.id)
      .limit(1)
    if (error) {
      console.error(`[checar-dup] erro consultando ${table}.${col}:`, error.message)
      return false
    }
    return !!(data && data.length)
  }

  let duplicado: CampoDuplicado | undefined

  const cpfDigits = soDigitos(cpf)
  if (!duplicado && cpfDigits.length === 11) {
    const variantes = [formatarCPF(cpfDigits), cpfDigits]
    // CPF pode estar em clientes.cpf ou no documento de um comerciante.
    if (await existe('clientes', 'cpf', variantes) || await existe('lojas', 'documento', variantes)) {
      duplicado = 'cpf'
    }
  }

  const cnpjDigits = soDigitos(cnpj)
  if (!duplicado && cnpjDigits.length === 14) {
    const variantes = [formatarCNPJ(cnpjDigits), cnpjDigits]
    // CNPJ pode estar em fornecedores.cnpj ou no documento de um comerciante.
    if (await existe('fornecedores', 'cnpj', variantes) || await existe('lojas', 'documento', variantes)) {
      duplicado = 'cnpj'
    }
  }

  const telDigits = soDigitos(telefone)
  if (!duplicado && (telDigits.length === 10 || telDigits.length === 11)) {
    const variantes = [formatarTelefone(telDigits), telDigits]
    if (
      await existe('lojas', 'telefone', variantes) ||
      await existe('clientes', 'telefone', variantes) ||
      await existe('fornecedores', 'telefone', variantes)
    ) {
      duplicado = 'telefone'
    }
  }

  return NextResponse.json({ ok: true, duplicado })
}
