// Rascunho de cardápio produzido por IA (#2 clone por foto, #3 geração por texto).
//
// As duas rotas devolvem o MESMO formato — `ItemRascunho[]` — para a tela de
// revisão ser uma só. Nada é gravado antes do comerciante confirmar em
// /api/cardapio/publicar.

export type ItemRascunho = {
  nome: string
  descricao: string
  categoria: string
  /** Em reais. No clone (#2) é o preço lido do papel; na geração (#3) é sugestão. */
  preco_venda: number
  /** true quando o preço veio do modelo e não do cardápio físico. */
  preco_sugerido: boolean
}

export const MAX_ITENS_RASCUNHO = 40

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(',', '.').replace(/[^0-9.]/g, ''))
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0
}

const txt = (v: unknown, max: number): string =>
  typeof v === 'string' ? v.trim().slice(0, max) : ''

/** Filtra e normaliza o que o modelo devolveu. Descarta item sem nome. */
export function sanitizarRascunho(bruto: unknown, precoSugerido: boolean): ItemRascunho[] {
  const arr = Array.isArray(bruto)
    ? bruto
    : Array.isArray((bruto as { itens?: unknown[] })?.itens)
      ? (bruto as { itens: unknown[] }).itens
      : []

  const out: ItemRascunho[] = []
  for (const item of arr) {
    const i = item as Record<string, unknown>
    const nome = txt(i.nome, 80)
    if (!nome) continue
    out.push({
      nome,
      descricao: txt(i.descricao, 300),
      categoria: txt(i.categoria, 40) || 'Geral',
      preco_venda: num(i.preco_venda ?? i.preco),
      preco_sugerido: precoSugerido,
    })
    if (out.length >= MAX_ITENS_RASCUNHO) break
  }
  return out
}

export const PROMPT_OCR = `Você lê a foto de um cardápio de papel de um estabelecimento brasileiro e transcreve os itens.

Para cada item legível, extraia:
- "nome": o nome do prato como está escrito.
- "descricao": a descrição/ingredientes, se houver. Se não houver, string vazia — NÃO invente.
- "categoria": a seção do cardápio (ex: "Lanches", "Bebidas", "Sobremesas"). Se não houver seções, deduza uma curta.
- "preco_venda": o preço em reais, como número (ex: 24.90). Se o preço não estiver legível, use 0.

Regras:
- Transcreva APENAS o que está escrito. Não invente pratos, descrições nem preços.
- Se a foto estiver ilegível ou não for um cardápio, devolva [].
- Ignore cabeçalho, telefone, endereço e redes sociais.

Responda APENAS com JSON: [{"nome":"...","descricao":"...","categoria":"...","preco_venda":0.00}]`

export function promptGeracao(descricao: string, tipoLoja: string): string {
  return `Você monta o cardápio de um pequeno comércio brasileiro${tipoLoja ? ` do ramo "${tipoLoja}"` : ''}.

O comerciante descreveu o que vende. Para CADA item que ele citou, crie:
- "nome": um nome comercial atraente, curto e reconhecível (ex: "X-Salada da Casa"). Nada de nomes pomposos ou estrangeiros sem necessidade.
- "descricao": 1 frase de até 140 caracteres com os ingredientes prováveis.
- "categoria": a seção do cardápio.
- "preco_venda": preço sugerido em reais, realista para o mercado brasileiro de 2026, como número.

Regras:
- Crie um item para cada coisa citada, e no máximo 3 variações a mais que façam sentido óbvio (ex: citou "refri" -> lata e 600ml).
- Não invente um cardápio inteiro a partir do nada: siga o que foi descrito.
- Preço é SUGESTÃO. Seja conservador; é melhor errar pra baixo.

Descrição do comerciante: "${descricao.replace(/"/g, "'")}"

Responda APENAS com JSON: [{"nome":"...","descricao":"...","categoria":"...","preco_venda":0.00}]`
}
