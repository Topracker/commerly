import Link from 'next/link'
import { Trash2, ChevronRight } from 'lucide-react'

// Card "Excluir minha conta" — o caminho DENTRO do app que a Google Play exige
// (proeminente, nas configurações). Igual para os 4 papéis; o fluxo em si mora
// em /conta/excluir, que descobre o papel sozinho.
export function ExcluirContaCard() {
  return (
    <div className="rounded-2xl border border-red-900/50 bg-red-950/20 p-4">
      <p className="text-red-300 text-sm font-semibold flex items-center gap-1.5">
        <Trash2 size={15} /> Excluir minha conta
      </p>
      <p className="text-gray-500 text-xs mt-1 leading-relaxed">
        Sua conta fica desativada na hora e é apagada de vez em 30 dias. Dá para desistir nesse
        prazo. Antes, você pode baixar uma cópia dos seus dados.
      </p>
      <Link
        href="/conta/excluir"
        className="mt-3 inline-flex items-center gap-1 text-red-400 hover:text-red-300 text-sm font-medium transition"
      >
        Continuar <ChevronRight size={15} />
      </Link>
    </div>
  )
}

export default ExcluirContaCard
