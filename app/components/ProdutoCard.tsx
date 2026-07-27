import { emojiCategoria, corAcentoNicho } from '../lib/temaLoja'

// Card de produto na vitrine. Sem imagem, mostra emoji temático (categoria ou
// nicho) sobre um glow radial sutil na cor do nicho. Hover: sobe 3px + borda
// terracota. Preço em Sora bold verde.
export function ProdutoCard({ produto, tipoLoja }: { produto: any; tipoLoja: string }) {
  const acento = corAcentoNicho(tipoLoja)
  // Promoção: quem monta a lista já troca `preco_venda` pelo promocional e
  // guarda o cheio em `preco_original` (ver /cliente/loja/[id]). Aqui é o único
  // lugar que mostra que houve desconto — sem isso o cliente só vê um preço
  // menor e a promoção não existe para ele.
  const original = produto.preco_original != null ? Number(produto.preco_original) : null
  const emPromocao = original != null && original > Number(produto.preco_venda)
  return (
    <div className="group relative rounded-2xl overflow-hidden bg-superficie border border-borda transition-all duration-200 hover:-translate-y-[3px] hover:border-acento">
      {emPromocao && (
        <span className="absolute top-2 left-2 z-10 text-[11px] font-bold px-2 py-0.5 rounded-full bg-red-500 text-white shadow">
          -{produto.desconto_pct ?? Math.round((1 - Number(produto.preco_venda) / original) * 100)}%
        </span>
      )}
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
        <p className="font-display font-bold text-acento mt-1 flex items-baseline gap-1.5 flex-wrap">
          R$ {parseFloat(produto.preco_venda).toFixed(2)}
          {emPromocao && (
            <span className="text-gray-500 text-xs font-normal line-through">R$ {original.toFixed(2)}</span>
          )}
        </p>
      </div>
    </div>
  )
}
