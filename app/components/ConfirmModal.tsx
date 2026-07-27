'use client'

type Props = {
  aberto: boolean
  titulo?: string
  mensagem: string
  onConfirm: () => void
  onCancel: () => void
  textoBotao?: string
  /**
   * Camada. O padrão `z-50` empata com os modais de formulário do app — e num
   * empate quem vem depois no DOM ganha, deixando esta confirmação VISÍVEL mas
   * sem receber clique. Quando abrir por cima de outro modal, suba para
   * `z-[60]`.
   */
  z?: string
}

export function ConfirmModal({ aberto, titulo = 'Confirmar', mensagem, onConfirm, onCancel, textoBotao = 'Confirmar', z = 'z-50' }: Props) {
  if (!aberto) return null
  return (
    <div className={`fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center p-6 ${z}`}>
      <div className="bg-gray-900 rounded-2xl p-6 w-full max-w-sm">
        <h3 className="text-white font-bold text-lg mb-2">{titulo}</h3>
        <p className="text-gray-400 mb-6">{mensagem}</p>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 bg-gray-800 hover:bg-gray-700 text-white py-3 rounded-xl transition">
            Cancelar
          </button>
          <button onClick={onConfirm} className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-3 rounded-xl transition">
            {textoBotao}
          </button>
        </div>
      </div>
    </div>
  )
}
