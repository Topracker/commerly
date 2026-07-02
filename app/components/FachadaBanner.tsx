import { Store } from 'lucide-react'

// Banner da foto da fachada no topo das páginas da loja. Sem foto, mostra um
// placeholder com degradê, ícone de loja, nome e tipo do comércio.
export function FachadaBanner({
  url,
  nome,
  tipo,
}: {
  url?: string | null
  nome: string
  tipo: string
}) {
  if (url) {
    return (
      <div className="w-full aspect-[16/9] sm:aspect-[3/1] rounded-2xl overflow-hidden bg-gray-900 mb-4">
        <img src={url} alt={`Fachada de ${nome}`} className="w-full h-full object-cover" />
      </div>
    )
  }

  return (
    <div className="w-full aspect-[16/9] sm:aspect-[3/1] rounded-2xl overflow-hidden mb-4 relative flex flex-col items-center justify-center text-center px-4 bg-gradient-to-br from-blue-600/30 via-gray-900 to-green-600/20">
      <Store size={40} className="text-white/70 mb-2" />
      <p className="text-white font-bold text-lg drop-shadow">{nome}</p>
      <span className="inline-block text-xs bg-black/30 text-white/90 px-2 py-0.5 rounded-full mt-1">{tipo}</span>
    </div>
  )
}
