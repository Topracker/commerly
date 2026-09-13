// ============================================================================
// PAPEL DA CONTA — fonte única do "este usuário já é de outra área?"
// ----------------------------------------------------------------------------
// Uma conta do Supabase Auth só pode ter UM papel no Commerly (comerciante,
// cliente, fornecedor ou entregador). Até a auditoria de 2026-09-11 (achado
// A6) cada login/onboarding reescrevia essa checagem à mão e todas esqueciam a
// tabela `entregadores`: um entregador logado passava por /login e criava uma
// loja, ou por /cliente/login e virava cliente também.
//
// Este módulo é o único lugar que responde à pergunta. Roda com a chave anon:
// cada tabela tem policy de SELECT do dono (`user_id = auth.uid()`), então a
// leitura só enxerga a própria linha — é exatamente o que precisamos.
// ============================================================================

export type Papel = 'comerciante' | 'cliente' | 'fornecedor' | 'entregador'

/** Ordem fixa: é a prioridade usada quando uma conta (indevidamente) tem mais de um papel. */
export const TODOS_PAPEIS: Papel[] = ['comerciante', 'cliente', 'fornecedor', 'entregador']

const TABELA: Record<Papel, string> = {
  comerciante: 'lojas',
  cliente: 'clientes',
  fornecedor: 'fornecedores',
  entregador: 'entregadores',
}

// Aceita qualquer client Supabase (anon no navegador, admin nas rotas).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = { from: (t: string) => any }

/**
 * Papéis que a conta já tem, na ordem de TODOS_PAPEIS. Erro de rede numa
 * tabela conta como "não tem" (comportamento que as telas já tinham) — a
 * barreira real contra duplicidade de perfil é a RLS/índices do banco.
 */
export async function papeisDaConta(supabase: Client, userId: string): Promise<Papel[]> {
  const achados = await Promise.all(
    TODOS_PAPEIS.map(async p => {
      const { data } = await supabase.from(TABELA[p]).select('id').eq('user_id', userId).maybeSingle()
      return data ? p : null
    })
  )
  return achados.filter((p): p is Papel => p !== null)
}

/**
 * Primeiro papel da conta DIFERENTE de `exceto` (a área que está checando), ou
 * null quando a conta é livre para essa área. É o que login/onboarding usam
 * para barrar "conta com dois papéis".
 */
export async function outroPapel(supabase: Client, userId: string, exceto: Papel): Promise<Papel | null> {
  const papeis = await papeisDaConta(supabase, userId)
  return papeis.find(p => p !== exceto) ?? null
}

/** Mensagem para a tela de LOGIN (a conta existe, mas é de outra área). */
export function msgLoginOutroPapel(papel: Papel): string {
  return `Esta conta está cadastrada como ${papel}. Use a área correta para fazer login.`
}

/** Mensagem para a tela de CADASTRO (o e-mail já tem perfil em outra área). */
export function msgCadastroOutroPapel(papel: Papel): string {
  return `Este e-mail já está cadastrado como ${papel}. Faça login para acessar sua conta.`
}
