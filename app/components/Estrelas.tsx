'use client'

type Props = {
  nota: number
  onSelect?: (n: number) => void
  tamanho?: string
}

export function Estrelas({ nota, onSelect, tamanho = 'text-2xl' }: Props) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <button
          key={i}
          onClick={() => onSelect?.(i)}
          className={`${tamanho} leading-none ${i <= nota ? 'text-yellow-400' : 'text-gray-600'} ${onSelect ? 'cursor-pointer hover:text-yellow-300 transition' : 'cursor-default'}`}
          type="button"
        >
          ★
        </button>
      ))}
    </div>
  )
}
