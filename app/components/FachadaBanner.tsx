import { Store } from 'lucide-react'

// Fotos da fachada no topo das páginas da loja.
// Sem foto: placeholder com degradê, ícone, nome e tipo.
// Uma foto: banner único. Várias: carrossel horizontal com snap.
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

  if (lista.length === 0) {
    return (
      <div className="w-full aspect-[16/9] sm:aspect-[3/1] rounded-2xl overflow-hidden mb-4 flex flex-col items-center justify-center text-center px-4 bg-gradient-to-br from-blue-600/30 via-gray-900 to-green-600/20">
        <Store size={40} className="text-white/70 mb-2" />
        <p className="text-white font-bold text-lg drop-shadow">{nome}</p>
        <span className="inline-block text-xs bg-black/30 text-white/90 px-2 py-0.5 rounded-full mt-1">{tipo}</span>
      </div>
    )
  }

  if (lista.length === 1) {
    return (
      <div className="w-full aspect-[16/9] sm:aspect-[3/1] rounded-2xl overflow-hidden bg-gray-900 mb-4">
        <img src={lista[0]} alt={`Fachada de ${nome}`} className="w-full h-full object-cover" />
      </div>
    )
  }

  return (
    <div className="flex gap-2 overflow-x-auto snap-x snap-mandatory scrollbar-hide mb-4 pb-1">
      {lista.map((url, i) => (
        <img
          key={i}
          src={url}
          alt={`Fachada de ${nome} ${i + 1}`}
          className="snap-center shrink-0 w-[88%] sm:w-[48%] aspect-[16/9] object-cover rounded-2xl bg-gray-900"
        />
      ))}
    </div>
  )
}
