'use client'

// Perfil de gamificação (nível, XP, streak, medalhas, missões) compartilhado
// entre os componentes que só precisam LER o resumo — hoje o <BadgeNivel/> do
// header e o <BlocoProgresso/> do dashboard.
//
// Cache de módulo de propósito: os dois montam na mesma tela e sem isto o
// dashboard dispararia mais uma chamada idêntica a /api/gamificacao/sync só
// para escrever "Bronze · 26 XP" na linha de resumo do bloco recolhido.
//
// O <PainelGamificacao/> continua com a busca própria: ele é o dono do POST em
// /api/stripe/aplicar-desconto e precisa de dados frescos a cada montagem.

export type PerfilGamificacao = {
  papel: string
  nome: string
  xp: number
  nivelXp: { nivel: number; pct: number; faltam: number }
  nivelPapel: { nome: string; emoji: string; cor: string }
  medalhas: { slug: string; concedida_em: string }[]
  missoes: string[]
  streak: { dias: number; recorde: number }
}

let cache: Promise<any> | null = null

export function carregarPerfil(): Promise<any> {
  if (!cache) {
    cache = fetch('/api/gamificacao/sync')
      .then(r => (r.ok ? r.json() : null))
      .catch(() => null)
  }
  return cache
}
