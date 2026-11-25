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
   * CNPJ do MEI. Se um dia voltar a ser `null`, as páginas dizem "CNPJ em
   * processo de regularização" em vez de imprimir um número vazio (ver
   * `cnpjTexto`).
   */
  cnpj: '66.528.448/0001-90' as string | null,
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

/**
 * Direito de arrependimento (CDC, art. 49): compra feita fora do
 * estabelecimento físico (o pedido pelo app conta como isso) pode ser
 * desistida em até 7 dias corridos da contratação ou do recebimento.
 */
export const LOJA_ARREPENDIMENTO_DIAS = 7

export const PRODUTO = {
  nome: 'Commerly',
  descricao: 'plataforma de gestão de comércio, delivery e pagamentos',
} as const

export const CONTATO = {
  email: 'suporte@commerly.com.br',
  /** Encarregado pelo tratamento de dados (DPO), art. 41 da LGPD — nome + canal. */
  encarregadoNome: 'Ediones Cesar dos Santos',
  encarregado: 'suporte@commerly.com.br',
  /**
   * Canal de denúncia (ética, abuso, fraude, violação destes Termos por
   * terceiro). USA A MESMA CAIXA do suporte de propósito: criar
   * denuncia@commerly.com.br exigiria configurar mais uma caixa/alias de
   * e-mail (DNS, Resend etc.) que ninguém testou ainda. Se um dia a Commerly
   * tiver uma caixa própria e monitorada para isso, troque só esta linha.
   */
  denuncia: 'suporte@commerly.com.br',
} as const

/** Data da última revisão dos documentos legais (formato exibido ao usuário). */
export const ATUALIZADO_EM = '25 de novembro de 2026'

/** Links do rodapé, em ordem de exibição. */
export const LINKS_RODAPE = [
  { href: '/sobre', label: 'Sobre' },
  { href: '/termos', label: 'Termos de Uso' },
  { href: '/privacidade', label: 'Privacidade' },
  { href: '/excluir-conta', label: 'Excluir conta' },
  { href: '/suporte', label: 'Suporte' },
] as const
