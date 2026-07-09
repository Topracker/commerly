import { gradienteHexNicho, emojiNicho } from '../lib/temaLoja'

// Banner hero no topo das páginas da loja.
// Sem foto: gradiente temático do nicho (hex) + textura de linhas diagonais +
//   emoji grande à direita + label da categoria no canto inferior esquerdo.
// Com foto: a(s) foto(s) como fundo do hero, com scrim e a mesma label.
// O card de info sobrepõe este banner (margin-top negativo na página).
export function FachadaBanner({
  fotos,
  nome,
  tipo,
}: {
  fotos?: string[] | null
  nome: string
  tipo: string
}) {
  const lista = (fotos || []).filter(Boolean)
  const [c1, c2, c3] = gradienteHexNicho(tipo)

  const label = (
    <span className="absolute bottom-3 left-4 z-10 text-xs font-medium text-white/95 bg-black/35 backdrop-blur-sm px-2.5 py-1 rounded-full">
      {tipo}
    </span>
  )

  if (lista.length === 0) {
    return (
      <div
        className="relative w-full h-44 sm:h-56 rounded-2xl overflow-hidden"
        style={{ background: `linear-gradient(120deg, ${c1} 0%, ${c2} 55%, ${c3} 100%)` }}
      >
        <div className="absolute inset-0 textura-diagonal" />
        <span className="absolute right-5 top-1/2 -translate-y-1/2 text-7xl sm:text-8xl drop-shadow-lg select-none">
          {emojiNicho(tipo)}
        </span>
        {label}
      </div>
    )
  }

  return (
    <div className="relative w-full h-44 sm:h-56 rounded-2xl overflow-hidden bg-card">
      {lista.length === 1 ? (
        <img src={lista[0]} alt={`Fachada de ${nome}`} className="w-full h-full object-cover" />
      ) : (
        <div className="flex h-full overflow-x-auto snap-x snap-mandatory scrollbar-hide">
          {lista.map((url, i) => (
            <img
              key={i}
              src={url}
              alt={`Fachada de ${nome} ${i + 1}`}
              className="snap-center shrink-0 w-full h-full object-cover"
            />
          ))}
        </div>
      )}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/60 to-transparent" />
      {label}
    </div>
  )
}
