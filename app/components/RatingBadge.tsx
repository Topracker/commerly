import { Star } from 'lucide-react'

// Pill dourado de avaliação em destaque no cabeçalho da loja: fundo dourado
// translúcido, borda dourada, estrela + média (Sora) + contagem.
export function RatingBadge({ media, total }: { media: number; total: number }) {
  return (
    <div className="shrink-0 flex items-center gap-1.5 rounded-full px-3 py-1.5 bg-[#F5C34B]/12 border border-[#F5C34B]/40">
      <Star size={15} className="fill-[#F5C34B] text-[#F5C34B]" />
      <span className="font-display font-bold text-[#F5C34B] text-base leading-none">{media.toFixed(1)}</span>
      <span className="text-[#F5C34B]/60 text-[11px] leading-none">({total})</span>
    </div>
  )
}
