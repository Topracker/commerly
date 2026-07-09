// Dados institucionais usados nas páginas legais (/termos, /privacidade,
// /suporte, /sobre) e no rodapé.
//
// Estes textos são uma BASE redigida por engenharia, não parecer jurídico.
// A LGPD (art. 9º, I e art. 41) exige identificar o controlador dos dados e
// oferecer um canal de contato do encarregado — ambos estão aqui. Vale uma
// revisão de advogado antes de tratar os documentos como definitivos.

export const EMPRESA = {
  /** Nome fantasia da operadora da plataforma. */
  nome: 'Oryon',
  razaoSocial: 'Oryon Tecnologia',
  /**
   * CNPJ do MEI. `null` enquanto a abertura não sai — as páginas então dizem
   * "CNPJ em processo de regularização" em vez de imprimir um número que não
   * existe. Assim que sair, basta preencher aqui (ver `cnpjTexto`).
   */
  cnpj: null as string | null,
  endereco: 'Goiânia, GO, Brasil',
} as const

/**
 * Trecho de identificação do CNPJ, pronto para entrar no meio de uma frase
 * ("Oryon Tecnologia, {cnpjTexto()}, com sede em ..."). Existe para que os três
 * documentos digam a mesma coisa enquanto o CNPJ não existe.
 */
export function cnpjTexto(): string {
  return EMPRESA.cnpj ? `CNPJ ${EMPRESA.cnpj}` : 'CNPJ em processo de regularização'
}

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
