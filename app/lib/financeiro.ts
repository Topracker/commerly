// Financeiro completo: fluxo de caixa, lucro real (com CMV) e DAS do MEI.
//
// Funções puras — a página /financeiro passa os dados já carregados.

// ATENÇÃO: o DAS é 5% do salário mínimo + tributo fixo. Atualize este valor
// todo ano, quando o salário mínimo mudar — o cálculo abaixo depende dele.
// Valor vigente em 2025: R$ 1.518,00.
export const SALARIO_MINIMO = 1518

// Teto de faturamento do MEI (anual). Acima disso o MEI é desenquadrado.
export const LIMITE_MEI_ANUAL = 81_000

export type AtividadeMei = 'comercio' | 'servicos' | 'ambos'

/** Tributo fixo somado ao INSS, por atividade (ICMS R$1 / ISS R$5). */
const TRIBUTO_FIXO: Record<AtividadeMei, number> = {
  comercio: 1,
  servicos: 5,
  ambos: 6,
}

/** Valor mensal do DAS-MEI: 5% do salário mínimo (INSS) + tributo fixo. */
export function valorDasMei(atividade: AtividadeMei, salarioMinimo = SALARIO_MINIMO): number {
  const inss = Math.round(salarioMinimo * 0.05 * 100) / 100
  return Math.round((inss + TRIBUTO_FIXO[atividade]) * 100) / 100
}

/** Quanto do teto anual do MEI já foi usado (0-1+; passa de 1 se estourou). */
export function usoDoLimiteMei(faturamentoAno: number): number {
  return faturamentoAno / LIMITE_MEI_ANUAL
}

/**
 * Teto proporcional: quem abriu o MEI no meio do ano tem o limite reduzido
 * (R$ 6.750 por mês de atividade, contando o mês de abertura).
 */
export function limiteMeiProporcional(mesesDeAtividade: number): number {
  const meses = Math.min(12, Math.max(1, mesesDeAtividade))
  return Math.round((LIMITE_MEI_ANUAL / 12) * meses * 100) / 100
}

// ─── Fluxo de caixa ─────────────────────────────────────────────────────────

export type MesFinanceiro = {
  chave: string      // YYYY-MM
  rotulo: string     // "jul/26"
  entradas: number
  saidas: number
  saldo: number
  cmv: number        // custo da mercadoria vendida
  lucroReal: number  // entradas - cmv - saidas
}

export type Entrada = { valor: number; cmv: number; data: string }
export type Saida = { valor: number; data: string }

const chaveMes = (iso: string) => iso.slice(0, 7)

function rotuloMes(chave: string): string {
  const [ano, mes] = chave.split('-')
  const nomes = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
  return `${nomes[Number(mes) - 1]}/${ano.slice(2)}`
}

/**
 * Agrega entradas e saídas nos últimos `meses` meses (do mais antigo ao atual).
 * Meses sem movimento aparecem zerados — o gráfico não pode ter buracos.
 */
export function fluxoDeCaixa(
  entradas: Entrada[],
  saidas: Saida[],
  meses = 6,
  agora = new Date(),
): MesFinanceiro[] {
  const mapa = new Map<string, MesFinanceiro>()

  for (let i = meses - 1; i >= 0; i--) {
    const d = new Date(agora.getFullYear(), agora.getMonth() - i, 1)
    const chave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    mapa.set(chave, { chave, rotulo: rotuloMes(chave), entradas: 0, saidas: 0, saldo: 0, cmv: 0, lucroReal: 0 })
  }

  for (const e of entradas) {
    const m = mapa.get(chaveMes(e.data))
    if (!m) continue
    m.entradas += e.valor
    m.cmv += e.cmv
  }
  for (const s of saidas) {
    const m = mapa.get(chaveMes(s.data))
    if (m) m.saidas += s.valor
  }

  for (const m of mapa.values()) {
    m.saldo = Math.round((m.entradas - m.saidas) * 100) / 100
    m.lucroReal = Math.round((m.entradas - m.cmv - m.saidas) * 100) / 100
    m.entradas = Math.round(m.entradas * 100) / 100
    m.saidas = Math.round(m.saidas * 100) / 100
    m.cmv = Math.round(m.cmv * 100) / 100
  }

  return [...mapa.values()]
}

/**
 * CMV de um pedido de delivery: soma custo × quantidade dos itens.
 * Itens sem custo cadastrado entram como 0 (não dá pra inventar margem).
 */
export function cmvDosItens(itens: unknown, custoPorProduto: Map<string, number>): number {
  if (!Array.isArray(itens)) return 0
  let total = 0
  for (const raw of itens) {
    const item = raw as { produto_id?: string; quantidade?: number }
    if (!item?.produto_id) continue
    const custo = custoPorProduto.get(item.produto_id) ?? 0
    total += custo * (Number(item.quantidade) || 0)
  }
  return total
}
