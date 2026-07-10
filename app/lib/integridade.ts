// Integridade verificável das avaliações (lojas e entregadores).
//
// O QUE ISTO GARANTE — e o que não garante.
//
// Cada avaliação carrega um `hash` = HMAC-SHA256(segredo, conteúdo || hash_anterior).
// Duas propriedades saem disso:
//
//   1. Ninguém de fora do servidor consegue produzir um hash válido, porque o
//      segredo (AVALIACOES_HMAC_SECRET) nunca sai do servidor. Um cliente não
//      forja uma avaliação "verificada".
//   2. Como cada hash inclui o hash da avaliação anterior, editar ou apagar uma
//      avaliação antiga invalida o hash dela e/ou o encadeamento das seguintes.
//      A adulteração não fica impossível — fica *detectável*, que é coisa
//      diferente e é o que a UI deve dizer.
//
// O que NÃO é: isto não é blockchain e não é imutável. Quem tem a service role
// e o segredo pode reescrever a cadeia inteira de forma consistente. Proteger
// contra isso exigiria ancorar os hashes fora do nosso controle (um log público,
// um timestamping externo). Enquanto não fizermos isso, a UI não deve prometer
// mais do que "avaliação verificada pelo Commerly".
//
// Por isso as tabelas são append-only (as policies de INSERT/UPDATE/DELETE do
// cliente foram removidas em sql/2026-07-15-features-12.sql) e toda escrita
// passa por /api/avaliacoes, com service role.

import { createHmac, timingSafeEqual } from 'crypto'

/** Campos que entram no hash. Mudar isto invalida a cadeia inteira. */
export type ConteudoAvaliacao = {
  seq: number
  cliente_id: string
  /** loja_id (avaliações de loja) ou entregador_id (avaliações de entregador). */
  alvo_id: string
  nota: number
  comentario: string | null
  created_at: string
}

/** Primeiro elo da cadeia. */
export const HASH_GENESIS = 'genesis'

/**
 * Separador dos campos na serialização. É um caractere de controle (RS, 0x1e)
 * justamente porque não pode aparecer num comentário digitado pelo cliente —
 * sem separador, `seq=1|cliente="23"` e `seq=12|cliente="3"` gerariam a mesma
 * string e portanto o mesmo hash.
 */
const SEP = '\u001e'

/** Sentinela para comentário ausente, distinguível de comentário vazio. */
const NULO = '\u0000null'

function segredo(): string {
  const s = process.env.AVALIACOES_HMAC_SECRET
  if (!s) throw new Error('AVALIACOES_HMAC_SECRET ausente')
  return s
}

/**
 * Serialização canônica. Precisa ser estável para sempre: ordem dos campos fixa,
 * separador que não aparece nos valores, null distinguível de "".
 *
 * `created_at` é normalizado para ISO-8601 em UTC porque o Postgres devolve
 * `timestamptz` como `2026-07-15 10:00:00+00`, enquanto o Node escreveria
 * `2026-07-15T10:00:00.000Z`. Sem normalizar, o hash calculado na escrita não
 * bateria com o recalculado na verificação.
 */
function canonico(c: ConteudoAvaliacao): string {
  const quando = new Date(c.created_at)
  if (Number.isNaN(quando.getTime())) throw new Error(`created_at inválido: ${c.created_at}`)
  return [
    String(c.seq),
    c.cliente_id,
    c.alvo_id,
    String(c.nota),
    c.comentario === null ? NULO : c.comentario,
    quando.toISOString(),
  ].join(SEP)
}

/** HMAC-SHA256 hex do conteúdo encadeado ao hash anterior. */
export function calcularHash(c: ConteudoAvaliacao, hashAnterior: string): string {
  return createHmac('sha256', segredo())
    .update(hashAnterior + SEP + canonico(c))
    .digest('hex')
}

/** Comparação em tempo constante (não vaza o hash esperado por timing). */
export function hashConfere(c: ConteudoAvaliacao, hashAnterior: string, hash: string): boolean {
  let esperado: string
  try { esperado = calcularHash(c, hashAnterior) } catch { return false }
  const a = Buffer.from(esperado, 'utf8')
  const b = Buffer.from(hash, 'utf8')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export type EloCadeia = ConteudoAvaliacao & { id: string; hash: string | null; hash_anterior: string | null }

export type ResultadoVerificacao = {
  total: number
  /** Avaliações anteriores à feature — sem hash, não verificáveis. */
  legado: number
  verificadas: number
  /** ids cujo hash não bate: conteúdo alterado, ou elo anterior removido. */
  invalidas: string[]
}

/**
 * Reprocessa a cadeia em ordem de `seq` e diz quais elos conferem.
 *
 * Linhas antigas (hash null) são "legado": não entram na cadeia e não contam
 * como inválidas — mas também não recebem o selo de verificada.
 */
export function verificarCadeia(elos: EloCadeia[]): ResultadoVerificacao {
  const ordenados = [...elos].sort((a, b) => a.seq - b.seq)
  const out: ResultadoVerificacao = { total: ordenados.length, legado: 0, verificadas: 0, invalidas: [] }

  let anterior = HASH_GENESIS
  for (const e of ordenados) {
    if (!e.hash) { out.legado++; continue }
    // O elo declara a qual hash se encadeia. Se não for o que esperamos, alguma
    // avaliação entre os dois foi removida.
    const encadeiaEm = e.hash_anterior ?? HASH_GENESIS
    if (encadeiaEm !== anterior || !hashConfere(e, encadeiaEm, e.hash)) {
      out.invalidas.push(e.id)
    } else {
      out.verificadas++
    }
    anterior = e.hash
  }
  return out
}

/** Prefixo curto do hash, para exibir junto da avaliação. */
export function hashCurto(hash: string): string {
  return `${hash.slice(0, 8)}…${hash.slice(-4)}`
}
