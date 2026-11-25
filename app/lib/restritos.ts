// Produtos de venda restrita a maiores de 18 anos (bebida alcoólica e
// cigarro/tabaco). O ECA Digital (Lei 15.211/2025) não aceita autodeclaração
// de idade para isso, e vender a menor é crime no ECA. Por isso o pedido com
// um desses itens só passa para conta com idade VERIFICADA.
//
// "Verificada" = `app_metadata.idade_verificada === true`. É app_metadata (e
// não user_metadata) de propósito: o usuário consegue editar o próprio
// user_metadata, mas só o servidor escreve em app_metadata. Hoje nenhuma conta
// tem a marca — ela passa a existir quando um provedor de verificação de
// idade/identidade for integrado. Até lá, esses itens ficam bloqueados.

const PADRAO = new RegExp(
  '\\b(' + [
    'cerveja\\w*', 'chopp?', 'vinho\\w*', 'espumante\\w*', 'champanh?e', 'vodk?a', 'whisk?y', 'uisque',
    'cachaca\\w*', 'pinga', 'gin', 'rum', 'licor\\w*', 'tequila', 'conhaque', 'aperol', 'campari',
    'destilado\\w*', 'bebida\\s+alcoolica\\w*', 'sidra', 'fernet', 'absinto',
    'cigarro\\w*', 'tabaco', 'charuto\\w*', 'narguile', 'vape\\w*', 'rape', 'fumo\\s+de\\s+corda',
  ].join('|') + ')\\b',
)

function normalizar(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/** Nomes (da lista) que são de venda restrita a maiores de 18. */
export function itensRestritos(nomes: string[]): string[] {
  return nomes.filter(n => PADRAO.test(normalizar(n || '')))
}

/** Conta com idade verificada por provedor (marca só o servidor escreve). */
export function idadeVerificada(user: { app_metadata?: Record<string, unknown> } | null | undefined): boolean {
  return user?.app_metadata?.idade_verificada === true
}

export function msgItemRestrito(itens: string[]): string {
  const lista = itens.slice(0, 3).join(', ')
  return `Este pedido tem produto de venda proibida para menores (${lista}). Por lei, só vendemos a quem teve a idade verificada, e essa verificação ainda não está disponível. Tire o item do pedido para continuar.`
}
