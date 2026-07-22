import { StoreIcon } from 'lucide-react'

/**
 * Loja fora do ar para o cliente (plano do comerciante vencido).
 *
 * A mensagem é deliberadamente neutra: o consumidor não tem nada a ver com a
 * inadimplência do lojista, então nada de "plano vencido", "pagamento" ou
 * qualquer coisa que exponha a situação comercial da loja.
 *
 * Só o miolo — cada tela envolve no próprio shell (/cardapio é página escura
 * sem login; /cliente/loja/[id] roda dentro do ClienteLayout).
 */
export function LojaIndisponivel({ acao }: { acao?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center px-6 py-24">
      <div className="w-16 h-16 rounded-full bg-gray-800 flex items-center justify-center mb-5">
        <StoreIcon size={28} className="text-gray-500" />
      </div>
      <h1 className="font-display text-xl font-bold text-white mb-2">
        Esta loja não está disponível no momento
      </h1>
      <p className="text-gray-400 text-sm max-w-sm">
        Ela pode voltar a atender em breve. Enquanto isso, veja outras lojas por perto.
      </p>
      {acao ? <div className="mt-6">{acao}</div> : null}
    </div>
  )
}
