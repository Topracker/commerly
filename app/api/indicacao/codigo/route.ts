import { NextResponse } from 'next/server'
import { createAdminClient } from '../../../lib/supabase-admin'
import { supabaseDaRota, usuarioDaRota } from '../../../lib/rotaSupabase'
import { gerarCodigoIndicacao } from '../../../lib/crescimento'

export const runtime = 'nodejs'

// Devolve (ou cria) o código de indicação do usuário logado, com o total de usos.
export async function GET() {
  const supabase = await supabaseDaRota()
  const user = await usuarioDaRota(supabase)
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const admin = createAdminClient()

  const { data: existente } = await admin
    .from('codigos_indicacao').select('codigo, usos, papel').eq('user_id', user.id).maybeSingle()
  if (existente) {
    // usos ao vivo = indicações confirmadas para este código.
    const { count } = await admin
      .from('indicacoes').select('id', { count: 'exact', head: true }).eq('codigo', existente.codigo)
    return NextResponse.json({ codigo: existente.codigo, papel: existente.papel, usos: count ?? existente.usos ?? 0 })
  }

  // Descobre o papel + nome-base para o código.
  let papel = 'cliente'
  let nomeBase = user.email?.split('@')[0] || 'user'
  const [{ data: loja }, { data: cli }, { data: ent }, { data: forn }] = await Promise.all([
    admin.from('lojas').select('nome').eq('user_id', user.id).maybeSingle(),
    admin.from('clientes').select('nome').eq('user_id', user.id).maybeSingle(),
    admin.from('entregadores').select('nome').eq('user_id', user.id).maybeSingle(),
    admin.from('fornecedores').select('nome').eq('user_id', user.id).maybeSingle(),
  ])
  if (loja) { papel = 'comerciante'; nomeBase = loja.nome }
  else if (cli) { papel = 'cliente'; nomeBase = cli.nome }
  else if (ent) { papel = 'entregador'; nomeBase = ent.nome }
  else if (forn) { papel = 'fornecedor'; nomeBase = forn.nome }

  // Gera um código único (tenta algumas vezes em caso de colisão).
  let codigo = ''
  for (let i = 0; i < 6; i++) {
    codigo = gerarCodigoIndicacao(nomeBase)
    const { error } = await admin.from('codigos_indicacao').insert({ user_id: user.id, papel, codigo })
    if (!error) break
    if (error.code !== '23505') {
      console.error('[indicacao/codigo] erro:', error.message)
      return NextResponse.json({ error: 'Não foi possível gerar seu código.' }, { status: 500 })
    }
    codigo = ''
  }
  if (!codigo) return NextResponse.json({ error: 'Tente novamente em instantes.' }, { status: 500 })

  return NextResponse.json({ codigo, papel, usos: 0 })
}
