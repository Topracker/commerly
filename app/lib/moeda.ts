// Formatador único de preço para as telas do cliente: sempre "R$ 1.234,50"
// (duas casas, vírgula decimal, ponto nos milhares). Não usa o estilo
// `currency` do Intl porque ele põe um espaço não separável depois do "R$",
// que quebra a busca de texto e o WhatsApp de forma diferente por navegador.

const FORMATO = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function reais(v: number | string | null | undefined): string {
  const n = Number(v)
  return `R$ ${FORMATO.format(Number.isFinite(n) ? n : 0)}`
}
