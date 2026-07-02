import { emojiCategoria } from '../lib/temaLoja'

// Card de produto na vitrine da loja. Sem imagem, mostra um emoji temático da
// categoria (ou do nicho) no lugar da caixinha genérica. Hover suave.
export function ProdutoCard({ produto, tipoLoja }: { produto: any; tipoLoja: string }) {
  return (
    <div className="group bg-gray-900 rounded-2xl overflow-hidden border border-gray-800 hover:border-gray-600 hover:-translate-y-0.5 transition-all duration-200">
      {produto.imagem_url ? (
        <div className="w-full h-32 overflow-hidden">
          <img
            src={produto.imagem_url}
            alt={produto.nome}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        </div>
      ) : (
        <div className="w-full h-32 bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center text-4xl transition-transform duration-300 group-hover:scale-110">
          {emojiCategoria(produto.categoria, tipoLoja)}
        </div>
      )}
      <div className="p-3">
        <p className="text-white font-medium text-sm truncate">{produto.nome}</p>
        {produto.categoria && <p className="text-gray-500 text-xs truncate">{produto.categoria}</p>}
        <p className="text-green-400 font-bold mt-1">R$ {parseFloat(produto.preco_venda).toFixed(2)}</p>
      </div>
    </div>
  )
}
