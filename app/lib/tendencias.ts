// #12 Radar de tendências — o que está mais pedido na cidade da loja, hoje.
//
// Os itens do pedido moram num jsonb (`pedidos_clientes.itens`), então a
// agregação é feita em memória sobre a janela de 24h. Isso é barato enquanto o
// volume por cidade for baixo; quando não for, isto vira uma materialized view
// atualizada pelo cron.

export type ItemTendencia = {
  nome: string
  /** Quantidade total pedida na janela. */
  quantidade: number
  /** Em quantas lojas distintas o item aparece. */
  lojas: number
}

export type Tendencia = {
  cidade: string
  itens: ItemTendencia[]
  /** Pedidos considerados na janela. */
  pedidos: number
  atualizadoEm: string
}

export const JANELA_HORAS = 24
/** Menos que isso não é tendência, é coincidência. */
export const MIN_PEDIDOS_CIDADE = 3

/**
 * `lojas.localizacao` é texto livre ("Setor Bueno, Goiânia - GO"). Normalizamos
 * pegando o trecho após a última vírgula sem o estado, em minúsculas e sem
 * acento, para agrupar "Goiânia - GO" e "goiania-go" na mesma cidade.
 */
export function normalizarCidade(localizacao: string | null | undefined): string {
  if (!localizacao) return ''
  const partes = localizacao.split(',')
  const ultima = partes[partes.length - 1] ?? ''
  return ultima
    .replace(/[-–]\s*[A-Za-z]{2}\s*$/, '') // tira " - GO"
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .trim().toLowerCase()
}

/** Reexibe a cidade com a primeira letra maiúscula. */
export function exibirCidade(cidadeNormalizada: string): string {
  return cidadeNormalizada.replace(/\b\w/g, c => c.toUpperCase())
}

type ItemPedido = { nome?: unknown; quantidade?: unknown }
type PedidoParaAgregar = { loja_id: string; itens: unknown }

/**
 * Chave de agrupamento do item. Minúsculas, sem acento, e pontuação/espaços
 * colapsados — assim "X-Bacon", "x bacon" e "X BACON" contam como o mesmo
 * prato. Cada loja escreve o nome do seu jeito; sem isto, a "tendência" da
 * cidade seria uma lista de grafias.
 */
function chaveItem(nome: string): string {
  return nome
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Agrega os itens dos pedidos e devolve o ranking. */
export function agregarTendencias(pedidos: PedidoParaAgregar[], limite = 3): ItemTendencia[] {
  const acc = new Map<string, { quantidade: number; lojas: Set<string>; grafias: Map<string, number> }>()

  for (const p of pedidos) {
    const itens = Array.isArray(p.itens) ? (p.itens as ItemPedido[]) : []
    for (const i of itens) {
      const nome = typeof i.nome === 'string' ? i.nome.trim() : ''
      if (!nome) continue
      const qtd = Number(i.quantidade)
      if (!Number.isFinite(qtd) || qtd <= 0) continue

      // Agrupa por nome normalizado, mas exibe a grafia mais frequente.
      const chave = chaveItem(nome)
      if (!chave) continue
      const cur = acc.get(chave) ?? { quantidade: 0, lojas: new Set<string>(), grafias: new Map<string, number>() }
      cur.quantidade += qtd
      cur.lojas.add(p.loja_id)
      cur.grafias.set(nome, (cur.grafias.get(nome) ?? 0) + 1)
      acc.set(chave, cur)
    }
  }

  const maisFrequente = (grafias: Map<string, number>): string =>
    [...grafias.entries()].sort((a, b) => b[1] - a[1])[0][0]

  return [...acc.values()]
    .map(v => ({ nome: maisFrequente(v.grafias), quantidade: v.quantidade, lojas: v.lojas.size }))
    .sort((a, b) => b.quantidade - a.quantidade || b.lojas - a.lojas)
    .slice(0, limite)
}

/** Frase do card. Vazia quando não há dados suficientes. */
export function fraseTendencia(t: Tendencia | null): string {
  if (!t || t.itens.length === 0) return ''
  const top = t.itens[0]
  return `🔥 Tendência: ${top.nome} tá bombando em ${exibirCidade(t.cidade)}`
}
