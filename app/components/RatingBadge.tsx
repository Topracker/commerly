import { Star } from 'lucide-react'

// Badge dourado de avaliação, em destaque no cabeçalho da loja.
export function RatingBadge({ media, total }: { media: number; total: number }) {
  return (
    <div className="shrink-0 flex items-center gap-1.5 bg-gradient-to-br from-yellow-400/25 to-amber-600/15 border border-yellow-500/40 rounded-xl px-3 py-1.5 shadow-lg shadow-yellow-500/5">
      <Star size={16} className="fill-yellow-400 text-yellow-400" />
      <span className="text-yellow-200 font-bold text-base leading-none">{media.toFixed(1)}</span>
      <span className="text-yellow-200/60 text-[11px] leading-none">({total})</span>
    </div>
  )
}
