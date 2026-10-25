import { Crown } from 'lucide-react'

// Selo exclusivo dos 3 primeiros comerciantes que pagaram a mensalidade
// (tabela `fundadores`, ordem 1..3). Não confundir com o "FUNDADOR" simples do
// dashboard, que é o preço das 100 primeiras lojas (`lojas.fundador`).
export function SeloFundador({ ordem, compact = false }: { ordem: number; compact?: boolean }) {
  return (
    <span
      title={`Fundador nº ${ordem}: um dos 3 primeiros comerciantes a assinar a Commerly`}
      className={`inline-flex items-center gap-1 font-bold rounded-full border border-yellow-300/70 text-yellow-950 bg-gradient-to-r from-yellow-200 via-amber-400 to-yellow-500 shadow-[0_0_12px_rgba(251,191,36,0.45)] ${
        compact ? 'text-[10px] px-2 py-0.5' : 'text-[11px] px-2.5 py-0.5'
      }`}
    >
      <Crown size={compact ? 10 : 12} className="shrink-0" /> Fundador nº {ordem}
    </span>
  )
}
