// Idade mínima e aceite dos Termos — regra única usada nos 4 cadastros
// (comerciante, cliente, fornecedor, entregador). Espelha a cláusula 2 dos
// Termos de Uso e a seção 10 da Política de Privacidade:
//   - comerciante, fornecedor e entregador: 18 anos ou mais;
//   - cliente: 18+ livre; de 12 a 17 só com autorização do responsável legal;
//   - menor de 12 anos não cria conta.
//
// A data de nascimento é DECLARADA pela pessoa (o CPF sozinho não revela a
// idade). Fica em user_metadata do Supabase Auth junto com o registro do aceite.

import { ATUALIZADO_EM } from './legal'

export type PapelCadastro = 'comerciante' | 'cliente' | 'fornecedor' | 'entregador'

export const IDADE_MINIMA_CLIENTE = 12
export const IDADE_MAIORIDADE = 18

/** Idade em anos completos hoje; null se a data for inválida ou futura. */
export function idadeDe(nascimentoISO: string, hoje: Date = new Date()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(nascimentoISO)
  if (!m) return null
  const [ano, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const d = new Date(ano, mes - 1, dia)
  if (d.getFullYear() !== ano || d.getMonth() !== mes - 1 || d.getDate() !== dia) return null
  let idade = hoje.getFullYear() - ano
  if (hoje.getMonth() < mes - 1 || (hoje.getMonth() === mes - 1 && hoje.getDate() < dia)) idade--
  if (idade < 0) return null
  return idade
}

/** Cliente de 12 a 17 anos: precisa da autorização do responsável. */
export function precisaResponsavel(papel: PapelCadastro, nascimentoISO: string): boolean {
  if (papel !== 'cliente') return false
  const i = idadeDe(nascimentoISO)
  return i !== null && i >= IDADE_MINIMA_CLIENTE && i < IDADE_MAIORIDADE
}

export type DadosIdadeTermos = {
  nascimento: string
  aceitouTermos: boolean
  responsavelAutorizou: boolean
}

/** Mensagem de erro (ou null se está tudo certo). */
export function erroIdadeTermos(papel: PapelCadastro, d: DadosIdadeTermos): string | null {
  if (!d.nascimento) return 'Informe sua data de nascimento.'
  const idade = idadeDe(d.nascimento)
  if (idade === null || idade > 110) return 'Data de nascimento inválida.'
  if (papel === 'cliente') {
    if (idade < IDADE_MINIMA_CLIENTE) return 'Você precisa ter pelo menos 12 anos para criar uma conta.'
    if (idade < IDADE_MAIORIDADE && !d.responsavelAutorizou) {
      return 'Menores de 18 anos só podem criar conta com a autorização do pai, da mãe ou do responsável legal.'
    }
  } else if (idade < IDADE_MAIORIDADE) {
    const quem = papel === 'comerciante' ? 'comerciante' : papel === 'fornecedor' ? 'fornecedor' : 'entregador'
    return `Você precisa ter 18 anos ou mais para ser ${quem}.`
  }
  if (!d.aceitouTermos) return 'Aceite os Termos de Uso e a Política de Privacidade para continuar.'
  return null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ClienteAuth = { auth: { updateUser: (a: any) => Promise<{ error: unknown }> } }

/** Grava nascimento + aceite no usuário logado. Devolve true se salvou. */
export async function registrarIdadeTermos(supabase: ClienteAuth, d: DadosIdadeTermos): Promise<boolean> {
  const { error } = await supabase.auth.updateUser({
    data: {
      data_nascimento: d.nascimento,
      termos_aceitos_em: new Date().toISOString(),
      termos_versao: ATUALIZADO_EM,
      responsavel_autorizou: d.responsavelAutorizou,
    },
  })
  return !error
}
