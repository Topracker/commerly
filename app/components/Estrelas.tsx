'use client'

type Props = {
  nota: number
  onSelect?: (n: number) => void
  /** Compat: aceita classes text-* legadas; mapeadas para px. */
  tamanho?: string
}

// Mapeia o prop legado `tamanho` (classe text-*) para um tamanho em px do SVG.
const SIZE_MAP: Record<string, number> = {
  'text-sm': 16,
  'text-base': 18,
  'text-lg': 20,
  'text-xl': 24,
  'text-2xl': 28,
  'text-3xl': 34,
}

const CHEIA = '#F5C34B'
const VAZIA = '#3A424C'

function Estrela({ ativa, size }: { ativa: boolean; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={ativa ? CHEIA : VAZIA} className="transition-colors">
      <path d="M12 2.5l2.9 5.88 6.49.94-4.7 4.58 1.11 6.46L12 17.77l-5.8 3.05 1.1-6.46-4.69-4.58 6.49-.94z" />
    </svg>
  )
}

export function Estrelas({ nota, onSelect, tamanho = 'text-2xl' }: Props) {
  const size = SIZE_MAP[tamanho] ?? 24
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(i =>
        onSelect ? (
          <button
            key={i}
            onClick={() => onSelect(i)}
            type="button"
            aria-label={`${i} estrela${i > 1 ? 's' : ''}`}
            className="cursor-pointer hover:scale-110 transition-transform"
          >
            <Estrela ativa={i <= nota} size={size} />
          </button>
        ) : (
          <Estrela key={i} ativa={i <= nota} size={size} />
        ),
      )}
    </div>
  )
}
