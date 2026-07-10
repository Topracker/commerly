// IA Nutricionista (#9).
//
// O Gemini classifica cada produto a partir do nome + descrição e devolve tags.
// O resultado é CACHEADO em `produtos.tags_nutri` (com `nutri_analisado_em`),
// porque a busca não pode chamar o modelo por produto a cada consulta.
//
// LIMITE HONESTO: isto é uma estimativa a partir de texto, não uma análise
// laboratorial. A tag "menos de 500 cal" é um palpite do modelo sobre uma porção
// típica, e "sem glúten" não sabe de contaminação cruzada na cozinha. A UI
// mostra isso como sugestão e diz para confirmar com a loja — quem tem doença
// celíaca não pode depender de um LLM lendo "pão de queijo".

export const TAGS_NUTRI = ['vegetariano', 'sem_gluten', 'menos_500_cal', 'low_carb'] as const
export type TagNutri = (typeof TAGS_NUTRI)[number]

export const ROTULO_TAG: Record<TagNutri, string> = {
  vegetariano: '🥗 Vegetariano',
  sem_gluten: '🌾 Sem glúten',
  menos_500_cal: '🔥 Menos de 500 cal',
  low_carb: '💪 Low carb',
}

const VALIDAS = new Set<string>(TAGS_NUTRI)

export function isTagNutri(v: unknown): v is TagNutri {
  return typeof v === 'string' && VALIDAS.has(v)
}

/** Filtra o que veio do modelo, descartando tags inventadas. */
export function sanitizarTags(v: unknown): TagNutri[] {
  if (!Array.isArray(v)) return []
  const out = v.filter(isTagNutri)
  return [...new Set(out)]
}

/** Produto casa com o filtro se tiver TODAS as tags pedidas. */
export function casaFiltro(tagsProduto: string[] | null | undefined, filtro: TagNutri[]): boolean {
  if (filtro.length === 0) return true
  const set = new Set(tagsProduto ?? [])
  return filtro.every(t => set.has(t))
}

export const AVISO_NUTRI =
  'Classificação estimada por IA a partir da descrição do produto. Não substitui a informação nutricional da loja — confirme com o estabelecimento em caso de alergia ou restrição médica.'

export type ProdutoParaClassificar = { id: string; nome: string; descricao?: string | null; categoria?: string | null }

export function promptClassificacao(produtos: ProdutoParaClassificar[]): string {
  const lista = produtos
    .map((p, i) => `${i + 1}. id=${p.id} | nome="${p.nome}" | categoria="${p.categoria ?? ''}" | descrição="${(p.descricao ?? '').slice(0, 300)}"`)
    .join('\n')

  return `Você classifica itens de cardápio brasileiros quanto a restrições alimentares.

Para cada item, devolva as tags que se aplicam, dentre EXATAMENTE estas:
- "vegetariano": não contém carne, frango, peixe ou frutos do mar. (Ovos e laticínios são permitidos.)
- "sem_gluten": não contém trigo, cevada, centeio, aveia, farinha de rosca, pão, massa ou cerveja.
- "menos_500_cal": uma porção típica tem menos de 500 kcal.
- "low_carb": porção típica com menos de 20g de carboidrato (sem pão, arroz, massa, batata, açúcar).

Regras:
- Na dúvida, NÃO aplique a tag. Um falso negativo é irrelevante; um falso positivo pode adoecer alguém.
- Se a descrição estiver vazia, use só o nome — e seja mais conservador ainda.
- Item sem nenhuma tag aplicável recebe lista vazia.

Itens:
${lista}

Responda APENAS com um JSON array, sem texto antes ou depois, no formato:
[{"id": "<id do item>", "tags": ["vegetariano"]}, {"id": "<id>", "tags": []}]`
}
