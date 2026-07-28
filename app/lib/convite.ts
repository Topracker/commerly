// ============================================================================
// CÓDIGO DE CONVITE (indicação) — captura, guarda e monta o link.
// ----------------------------------------------------------------------------
// O código sobrevive por TRÊS caminhos, do mais forte para o mais fraco:
//
//   1. `?ref=CODIGO` na URL — funciona em QUALQUER página do app e sobrevive a
//      copiar/colar o link. É o único que atravessa a fronteira do aparelho:
//      o link mandado no WhatsApp carrega o código para onde ele for aberto.
//   2. Campo "Código de convite" no cadastro — o convidado digita o código que
//      leu no convite. É o que salva quem recebeu o link no celular e se
//      cadastrou no computador.
//   3. `localStorage` — memória entre a visita ao convite e o fim do cadastro,
//      no MESMO navegador. Era o único caminho até 2026-07-28, e por isso toda
//      troca de aparelho perdia a indicação em silêncio.
//
// Quem resgata é <IndicacaoClaim/> (layout raiz) chamando /api/indicacao/registrar.
// ============================================================================

/** Nome do parâmetro de convite na URL. */
export const PARAM_REF = 'ref'

/** Chave do localStorage onde o código aguarda até haver sessão. */
export const CHAVE_INDICACAO = 'commerly:indicacao'

/** Só A-Z e 0-9, caixa alta. Espelha `normalizarCodigo` de lib/festas. */
export function normalizarCodigo(v: string): string {
  return (v || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20)
}

/** Um código de convite plausível (os gerados têm 8-9 caracteres). */
export function codigoValido(v: string): boolean {
  return normalizarCodigo(v).length >= 4
}

/**
 * Link de convite com o código na URL.
 *
 * A base sai de `window.location.origin` no navegador: antes daqui três telas
 * tinham `https://commerly.vercel.app` fixo no código, um domínio de deploy que
 * não é o da marca. `?ref=` vai junto do path para que o código sobreviva mesmo
 * quando alguém compartilha só a URL final, depois de o app redirecionar.
 */
export function linkConvite(codigo: string, base?: string): string {
  const cod = normalizarCodigo(codigo)
  const origem = base
    || (typeof window !== 'undefined' ? window.location.origin : 'https://commerly.com.br')
  return `${origem}/convite/${cod}?${PARAM_REF}=${cod}`
}

/** Código presente na URL atual (`?ref=`), ou string vazia. */
export function codigoDaUrl(): string {
  if (typeof window === 'undefined') return ''
  try {
    const v = new URLSearchParams(window.location.search).get(PARAM_REF) || ''
    return codigoValido(v) ? normalizarCodigo(v) : ''
  } catch {
    return ''
  }
}

/** Código guardado no localStorage, ou string vazia. */
export function codigoGuardado(): string {
  if (typeof window === 'undefined') return ''
  try {
    const v = localStorage.getItem(CHAVE_INDICACAO) || ''
    return codigoValido(v) ? normalizarCodigo(v) : ''
  } catch {
    return ''
  }
}

/** Guarda o código para o resgate acontecer assim que houver sessão. */
export function guardarCodigo(codigo: string): void {
  if (typeof window === 'undefined') return
  const cod = normalizarCodigo(codigo)
  if (!codigoValido(cod)) return
  try { localStorage.setItem(CHAVE_INDICACAO, cod) } catch { /* modo privado */ }
}

/**
 * Código a usar agora, SEM efeito colateral: a URL manda (é a intenção mais
 * recente e explícita) e o localStorage entra como memória.
 *
 * Puro de propósito — é lido por `useSyncExternalStore` em <CampoConvite/>, e
 * um snapshot que escreve seria chamado a cada render. Quem persiste é
 * `codigoDeConvite()` ou o próprio componente, num efeito.
 */
export function lerCodigoDeConvite(): string {
  return codigoDaUrl() || codigoGuardado()
}

/**
 * Igual a `lerCodigoDeConvite`, mas já GUARDA o que encontrou na URL — assim o
 * código sobrevive à navegação até o fim do cadastro, mesmo que o convidado
 * passe por várias telas antes de criar a conta.
 */
export function codigoDeConvite(): string {
  const cod = lerCodigoDeConvite()
  if (cod) guardarCodigo(cod)
  return cod
}
