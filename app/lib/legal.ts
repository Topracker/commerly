// Dados institucionais usados nas páginas legais (/termos, /privacidade,
// /suporte, /sobre) e no rodapé.
//
// ⚠️ ANTES DE LANÇAR: os valores marcados como PENDENTE precisam ser
// preenchidos. A LGPD (art. 9º, I e art. 41) exige identificar o controlador
// dos dados e oferecer um canal de contato do encarregado. Publicar os
// documentos com os marcadores no ar é pior do que não publicar: é um
// documento juridicamente inválido apresentado como válido.
//
// Estes textos são uma BASE redigida por engenharia, não parecer jurídico.
// Passe por um advogado antes de colocar no ar.

/** Marcador visível no texto quando o dado ainda não existe. */
export const PENDENTE = (campo: string) => `[${campo}]`

export const EMPRESA = {
  /** Nome fantasia da operadora da plataforma. */
  nome: 'Oryon',
  /** Razão social completa. PENDENTE. */
  razaoSocial: PENDENTE('RAZÃO SOCIAL DA ORYON'),
  cnpj: PENDENTE('CNPJ'),
  endereco: PENDENTE('ENDEREÇO COMPLETO'),
} as const

export const PRODUTO = {
  nome: 'Commerly',
  descricao: 'plataforma de gestão de comércio, delivery e pagamentos',
} as const

export const CONTATO = {
  email: 'suporte@commerly.app',
  /** Encarregado pelo tratamento de dados (DPO), art. 41 da LGPD. */
  encarregado: 'suporte@commerly.app',
} as const

/** Data da última revisão dos documentos legais (formato exibido ao usuário). */
export const ATUALIZADO_EM = '9 de julho de 2026'

/** Links do rodapé, em ordem de exibição. */
export const LINKS_RODAPE = [
  { href: '/sobre', label: 'Sobre' },
  { href: '/termos', label: 'Termos de Uso' },
  { href: '/privacidade', label: 'Privacidade' },
  { href: '/suporte', label: 'Suporte' },
] as const

/** true quando ainda há placeholder nos dados da empresa. */
export function temPendencias(): boolean {
  return [EMPRESA.razaoSocial, EMPRESA.cnpj, EMPRESA.endereco].some(v => v.startsWith('['))
}
