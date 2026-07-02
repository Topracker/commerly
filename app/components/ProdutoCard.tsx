import { emojiCategoria, corAcentoNicho } from '../lib/temaLoja'

// Card de produto na vitrine. Sem imagem, mostra emoji temático (categoria ou
// nicho) sobre um glow radial sutil na cor do nicho. Hover: sobe 3px + borda
// terracota. Preço em Sora bold verde.
export function ProdutoCard({ produto, tipoLoja }: { produto: any; tipoLoja: string }) {
  const acento = corAcentoNicho(tipoLoja)
  return (
    <div className="group rounded-2xl overflow-hidden bg-[#171C22] border border-[#232A32] transition-all duration-200 hover:-translate-y-[3px] hover:border-[#C1441E]">
      {produto.imagem_url ? (
        <div className="w-full h-32 overflow-hidden">
          <img
            src={produto.imagem_url}
            alt={produto.nome}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        </div>
      ) : (
        <div className="relative w-full h-32 flex items-center justify-center">
          <div
            className="absolute inset-0"
            style={{ background: `radial-gradient(circle at center, ${acento}33 0%, transparent 65%)` }}
          />
          <span className="relative text-4xl transition-transform duration-300 group-hover:scale-110">
            {emojiCategoria(produto.categoria, tipoLoja)}
          </span>
        </div>
      )}
      <div className="p-3">
        <p className="text-white font-medium text-sm truncate">{produto.nome}</p>
        {produto.categoria && <p className="text-gray-500 text-xs truncate">{produto.categoria}</p>}
        <p className="font-display font-bold text-[#6FD98F] mt-1">R$ {parseFloat(produto.preco_venda).toFixed(2)}</p>
      </div>
    </div>
  )
}
