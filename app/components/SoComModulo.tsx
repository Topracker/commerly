'use client'
import { useFlags } from '../lib/useFlags'

// Renderiza os filhos só com a chave de módulo LIGADA. Para chamados que
// INICIAM algo (pedir, buscar loja, buscar fornecedor) em telas que continuam
// abertas com a chave desligada. Enquanto as flags carregam, mostra (useFlags
// trata tudo como ligado até saber) — a trava de verdade é no servidor.
export function SoComModulo({ modulo, children }: { modulo: string; children: React.ReactNode }) {
  const { ativa } = useFlags()
  return ativa(modulo) ? <>{children}</> : null
}
